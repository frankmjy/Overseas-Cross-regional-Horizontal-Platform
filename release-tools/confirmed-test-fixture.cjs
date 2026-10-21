'use strict';
const {ids}=require('./confirmed-test-cleanup.cjs');
function testState(){
 const payloads=[{kind:'topic',clientMutationId:ids[0],name:'1111',description:''},{kind:'question',clientMutationId:ids[1],title:'23234234',category:'1111',priority:true},{kind:'question-visibility',clientMutationId:ids[2],questionId:'Q-'+ids[1].toUpperCase(),deleted:true,version:'a'.repeat(64)}];
 const operations={existing:{id:'existing',hash:'b'.repeat(64),status:'success',payload:{kind:'question-visibility',questionId:'Q-EXISTING',deleted:true},steps:{},dependencies:[]}};
 for(let i=0;i<ids.length;i++)operations[ids[i]]={id:ids[i],hash:String(i+1).repeat(64),status:i?'blocked':'error',createdAt:new Date().toISOString(),payload:payloads[i],steps:i?{}:{topic:{status:'started'}},dependencies:i?[ids[i-1]]:[]};
 return {operations,uploads:{},cache:{syncedAt:new Date().toISOString(),raw:{questions:[],findings:[],evidence:[],topics:[]}}};
}
module.exports={testState};
