var fs = require('fs') 
var src = fs.readFileSync('src/editor.js','utf8'); 
var idx = src.indexOf('function linePrefix'); 
var before = src.substring(0,idx); 
var after = src.substring(idx); 
var code = '' +  
  'function smartToggleFormat(text,before,after){' +  
