import assert from "node:assert/strict";
import {academyLevels,assessmentAvailable,finalAssessmentIndex,requiredCurriculum} from "../lib/curriculum.ts";
import {editingGlossary} from "../lib/editing-glossary.ts";

const level="new";
const firstLevelSlugs=academyLevels[0].lessons.map(lesson=>lesson.slug);
assert.ok(firstLevelSlugs.length>0,"The first academy level must contain lessons");
assert.equal(assessmentAvailable(0,[],[],level),false,"Assessment must stay locked before required lessons");
assert.equal(assessmentAvailable(0,firstLevelSlugs,[],level),true,"Assessment must open after required lessons");
assert.equal(assessmentAvailable(1,requiredCurriculum.map(lesson=>lesson.slug),[],level),false,"A later assessment must require the previous assessment");
assert.equal(assessmentAvailable(1,requiredCurriculum.map(lesson=>lesson.slug),[0],level),true,"A later assessment opens after the previous assessment");
assert.equal(assessmentAvailable(finalAssessmentIndex,requiredCurriculum.map(lesson=>lesson.slug),[0,1],level),false,"The graduation exam must require every level assessment");
assert.equal(assessmentAvailable(finalAssessmentIndex,requiredCurriculum.map(lesson=>lesson.slug),[0,1,2],level),true,"The graduation exam opens after the full route");

const requiredTerms=["Timeline","Export","Frame rate / FPS","Bitrate","Codec","Keyframe","Mask","B-roll","Color correction","Technical brief","Portfolio"];
const englishTerms=new Set(editingGlossary.map(entry=>entry.english));
for(const term of requiredTerms)assert.ok(englishTerms.has(term),`Glossary is missing ${term}`);
assert.equal(englishTerms.size,editingGlossary.length,"Glossary English names must be unique");
for(const entry of editingGlossary){
  for(const key of ["english","russian","explanation","example","programs","commonMistake"]){
    assert.ok(entry[key]?.trim(),`Glossary entry ${entry.english} is missing ${key}`);
  }
  assert.ok(entry.keywords.length>0,`Glossary entry ${entry.english} must have lesson keywords`);
}

console.log(`Content audit checks passed: ${academyLevels.length} levels, ${editingGlossary.length} glossary entries.`);
