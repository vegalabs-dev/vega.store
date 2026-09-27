(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VegaMessage=api;})(globalThis,function(){
    'use strict';
    const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function inline(text){
        const pattern=/(`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
        let html='',start=0;
        for(const match of text.matchAll(pattern)){html+=escape(text.slice(start,match.index));const tag={'*':'strong','_':'em','~':'s','`':'code'}[match[0][0]];html+='<'+tag+'>'+escape(match[0].slice(1,-1))+'</'+tag+'>';start=match.index+match[0].length;}
        return html+escape(text.slice(start));
    }
    function preview(text){
        return String(text).split(/(```[\s\S]*?```)/g).map(part=>part.startsWith('```')?'<pre>'+escape(part.slice(3,-3))+'</pre>':part.split('\n').map(line=>{
            if(line.startsWith('> '))return '<blockquote>'+inline(line.slice(2))+'</blockquote>';
            if(/^[-*] /.test(line))return '<div class="wa-list">• '+inline(line.slice(2))+'</div>';
            if(/^\d+\. /.test(line))return '<div class="wa-list">'+inline(line)+'</div>';
            return '<div>'+ (inline(line)||'<br>') +'</div>';
        }).join('')).join('');
    }
    function protect(text,values){
        let result=String(text);
        // A single replacement pass prevents a name from modifying another placeholder.
        const entries=Object.entries(values).filter(([,v])=>typeof v==='string'&&v.length).sort((a,b)=>b[1].length-a[1].length);
        if(!entries.length)return result;
        const regex=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+entries.map(([,v])=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![\\p{L}\\p{N}_])','giu');
        return result.replace(regex,value=>'[['+entries.find(([,v])=>v.toLowerCase()===value.toLowerCase())[0]+']]');
    }
    function restore(text,values){return String(text).replace(/\[\[([A-Z_]+)\]\]/g,(token,name)=>Object.hasOwn(values,name)?values[name]:token);}
    function privateData(text){return /https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d ()-]{7,}\d|\b[a-f0-9]{32,}\b|\beyJ[\w-]{20,}|\b(?:AIza[\w-]{20,}|AQ\.[\w.-]{20,}|sk-[\w-]{20,}|sb_secret_[\w-]{15,})/i.test(text);}
    return {preview,protect,restore,privateData};
});
