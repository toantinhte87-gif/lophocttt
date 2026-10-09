const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePromise = import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../public/js/topic-question-stats.js')).toString('base64'));
const children = [{id:'c1',topicId:'p1'},{id:'c2',topicId:'p1'},{id:'c3',topicId:'p2'}];
const questions = [
 {id:'TN1',subtopicId:'c1',type:'tn',level:'NB'},
 {id:'TN2',subtopicId:'c1',type:'tn',level:'TH'},
 {id:'DCX1',subtopicId:'c2',type:'dcx',level:'VD'},
 {id:'TL1',subtopicId:'c2',type:'tl',level:'VDC'},
 {id:'TN3',subtopicId:'c3',type:'tn',level:'NB'},
 {id:'LT1',subtopicId:'c1',type:'lt',level:''}
];
test('parent counts include all children; subject/grade branches with distinct IDs remain separate', async()=>{
 const {topicQuestionStats}=await modulePromise;
 const stats=topicQuestionStats(questions,children);
 assert.equal(stats.parents.get('p1').total,5);
 assert.deepEqual(stats.parents.get('p1').types,{tn:2,dcx:1,tl:1,lt:1});
 assert.deepEqual(stats.parents.get('p1').levels,{NB:1,TH:1,VD:1,VDC:1});
 assert.equal(stats.parents.get('p1').unclassified,1);
 assert.equal(stats.parents.get('p2').total,1);
 assert.equal(stats.children.get('c1').total,3);
 assert.equal(stats.children.get('c2').total,2);
});
test('child view stays within its topic; both filters combine; clearing filters keeps the child scope',async()=>{
 const {questionsInSubtopic}=await modulePromise;
 assert.deepEqual(questionsInSubtopic(questions,'c1',{type:'tn',level:'TH'}).map(q=>q.id),['TN2']);
 assert.deepEqual(questionsInSubtopic(questions,'c1',{level:'NB'}).map(q=>q.id),['TN1']);
 assert.equal(questionsInSubtopic(questions,'c1',{}).length,3);
 assert.equal(questionsInSubtopic(questions,'',{}).length,0);
 assert.equal(questionsInSubtopic(questions,'c1',{type:'tl'}).length,0);
});
test('counts recompute after a question is moved, changed or deleted; unknown levels remain visible',async()=>{
 const {topicQuestionStats}=await modulePromise;
 const changed=questions.filter(q=>q.id!=='TN1').map(q=>q.id==='TN2'?{...q,subtopicId:'c3',type:'TL',level:' vd '}:q);
 const stats=topicQuestionStats(changed,children);
 assert.equal(stats.parents.get('p1').total,3);
 assert.equal(stats.parents.get('p2').total,2);
 assert.equal(stats.parents.get('p2').types.tl,1);
 assert.equal(stats.parents.get('p2').levels.VD,1);
 assert.equal(stats.parents.get('p1').unclassified,1);
 assert.equal(topicQuestionStats([],children).parents.size,0);
});
