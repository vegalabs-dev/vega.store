const {test}=require('node:test');const assert=require('node:assert/strict');const format=require('../mensaje-formato.js');
test('WhatsApp preview renders supported formatting without executing HTML',()=>{
 const html=format.preview('*Hola* _amable_ ~anterior~\n> Una cita\n- Uno\n1. Dos\n`<img src=x onerror=alert(1)>`\n```<script>attack</script>```');
 assert.match(html,/<strong>Hola<\/strong>/);assert.match(html,/<em>amable<\/em>/);assert.match(html,/<s>anterior<\/s>/);assert.match(html,/<blockquote>Una cita<\/blockquote>/);
 assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;script&gt;/);
});
test('placeholder roundtrip protects names, dates and private links without changing substrings',()=>{
 const values={CLIENTE:'Vega',ENLACE_PRIVADO:'https://example.test/#acceso='+ 'a'.repeat(48),FECHA:'1 oct 2026'};
 const text='Hola Vega. VegaStore: '+values.ENLACE_PRIVADO+' hasta '+values.FECHA;
 const protectedText=format.protect(text,values);assert.match(protectedText,/Hola \[\[CLIENTE\]\]\. VegaStore/);assert.equal(format.privateData(protectedText),false);
 assert.equal(format.restore(protectedText,values),text);assert.equal(format.privateData('Contacta a person@example.test'),true);
 assert.equal(format.privateData('+51 999 999 999'),true);assert.equal(format.privateData('Breve, con 2 emojis'),false);
 assert.equal(format.privateData('AQ.'+'x'.repeat(40)),true);
});
