var C=String.fromCharCode; 
var Q=C(39);var B=C(92);var D=C(36);var A=C(38); 
var fs=require('fs');var src=fs.readFileSync('src/editor.js','utf8'); 
var si=src.indexOf('function smartToggleFormat'); 
