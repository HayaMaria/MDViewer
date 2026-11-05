"""Ожидание экспорта: по продвижению, а не по общему времени, и с отменой."""
import threading
from types import SimpleNamespace

from mdviewer import export


class _Window:
    """evaluate_js отвечает через answer_after секунд, а пока «страница» шлёт отметки."""

    def __init__(self, job, answer='<p>ok</p>', answer_after=None, ticks=0, tick_every=0.05):
        self.job = job
        self.answer = answer
        self.answer_after = answer_after
        self.ticks = ticks
        self.tick_every = tick_every

    def evaluate_js(self, script, callback):
        def run():
            for _ in range(self.ticks):
                threading.Event().wait(self.tick_every)
                export.note_progress(self.job.id)
            if self.answer_after is not None:
                threading.Event().wait(self.answer_after)
                callback(self.answer)

        threading.Thread(target=run, daemon=True).start()


def _run(monkeypatch, window, job):
    monkeypatch.setattr(export, 'state', SimpleNamespace(window=window))
    with export._jobs_lock:
        export._jobs[job.id] = job
    try:
        return export._await_js('prepareExportBody', 'dark', False, job.id, job=job)
    finally:
        with export._jobs_lock:
            export._jobs.pop(job.id, None)


def test_long_export_with_progress_is_not_cut(monkeypatch):
    monkeypatch.setattr(export, 'IDLE_TIMEOUT', 0.3)
    job = export._Job()
    job.touch()
    # Всего около 1 с — втрое дольше предела, но отметки идут всё время.
    window = _Window(job, answer_after=0.1, ticks=18, tick_every=0.05)
    assert _run(monkeypatch, window, job) == '<p>ok</p>'


def test_silence_times_out(monkeypatch):
    monkeypatch.setattr(export, 'IDLE_TIMEOUT', 0.3)
    job = export._Job()
    job.touch()
    assert _run(monkeypatch, _Window(job), job) is export._TIMED_OUT


def test_cancel_stops_waiting(monkeypatch):
    job = export._Job()
    threading.Timer(0.1, export.cancel, args=(job.id,)).start()
    assert _run(monkeypatch, _Window(job), job) is export._CANCELLED


def test_patience_is_capped(monkeypatch):
    job = export._Job()
    job.touch(10 ** 6)
    assert job.patience == export.MAX_PATIENCE
    job.touch('мусор')
    assert job.patience == export.IDLE_TIMEOUT
