export function chineseBody(value){
 if(typeof value!=='string')return value;
 if(/https?:\/\//i.test(value)||/^\s*[\[{]/.test(value)&&!/^\[Example/.test(value))return value;
 const m=/^(\d{2}\s+)?([A-Za-z][A-Za-z0-9 &/_.:-]*)（([^（）\n]*[\u4e00-\u9fff][^（）\n]*)）$/.exec(value);
 if(m){if(/^[A-Z0-9/-]{1,10}$/.test(m[2]))return value;return(m[1]||'')+m[3];}
 return value.replace(/^\[Example\s*[/／]\s*示例\]/,'[示例]');
}
export const chineseField=f=>['text','select'].includes(f.type)&&f.style?.type!=='url'&&!/Migration|Setup Key|Source Files|File Name|File Token|SHA-256|Source Content Cell|Source Evidence Cell|Original File/.test(f.name);
