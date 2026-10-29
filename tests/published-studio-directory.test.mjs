import test from 'node:test';
import assert from 'node:assert/strict';
import {applyActiveModelDirectory, getModelById, getI2IModelById, audioModels} from '../packages/studio/src/models.js';
import * as families from '../packages/studio/src/modelFamilies.js';
import {getServerModelMeta} from '../packages/studio/src/modelDescriptions.js';
import {getSupplementalModelInputs} from '../packages/studio/src/modelParameters.js';
import {buildSupplementalInputPayload} from '../packages/studio/src/modelParameters.js';
import {buildReferenceParams} from '../packages/studio/src/modelCapabilities.js';
import {publishedStudioModels} from '../packages/studio/src/publishedModelDirectory.js';
import {publicCanvasModel} from '../lib/canvas/modelDescriptor.js';
import {projectReadyRouteCapabilities} from '../lib/modelCenter/publicCapabilities.js';
import {validateCapabilityParameters} from '../lib/modelCenter/validateCapabilitySchema.js';

function published(id, type, taskTypes) {
  const row = {id, name:id, type, is_active:true, is_visible:true, auto_route_eligible:true, tier:'core', credits_price:10, hasWorkingRoute:true,
    generation_capabilities:projectReadyRouteCapabilities(taskTypes.map(task => ({supported_task_types:[task],
      mapping_capabilities:{input_types:task.startsWith('i2')?['image']:['text'],output_types:[type === 'music'?'audio':type],
        parameters:['prompt','creative_style'],input_schema:{type:'object',properties:{creative_style:{type:'string',enum:['calm','bold'],default:'calm'}},required:['creative_style']}}})))};
  return {...publicCanvasModel(row,{schemaVersion:2}), isActive:true,isVisible:true,autoRouteEligible:true,hasWorkingRoute:true};
}

test('previously unknown published models populate workbench schemas, families, prices and canonical IDs', () => {
  const image=published('fixture-unlisted-image','image',['t2i','i2i']);
  const video=published('fixture-unlisted-video','video',['t2v']);
  const music=published('fixture-unlisted-music','music',['t2m']);
  applyActiveModelDirectory([image,video,music]);
  const model=getModelById(`${image.id}::t2i`);
  assert.equal(model.inputs.creative_style.default,'calm');
  assert.equal(getI2IModelById(`${image.id}::i2i`).canonicalModelId,image.id);
  assert.equal(getServerModelMeta(model.id).id,image.id);
  assert.ok(getSupplementalModelInputs(model).some(field=>field.key==='creative_style'));
  const family=families.imageModelCatalog.familyById.get(image.id);
  assert.equal(family.variants.t2i[0].model.id,model.id);
  assert.equal(family.variants.i2i[0].model.id,`${image.id}::i2i`);
  assert.ok(families.imageModelPickerEntryByVariantId.has(model.id));
  assert.ok(families.videoModelCatalog.variantById.has(`${video.id}::t2v`));
  assert.equal(audioModels.find(model=>model.canonicalModelId===music.id).inputs.creative_style.enum[1],'bold');
  validateCapabilityParameters(image.id,image.capabilityVersion,image.inputSchema,{prompt:'A fixture',task_type:'t2i',creative_style:'bold'});
  assert.throws(()=>validateCapabilityParameters(image.id,image.capabilityVersion,image.inputSchema,{prompt:'A fixture',task_type:'t2v',creative_style:'bold'}),{code:'MODEL_PARAMETERS_INVALID'});
  // A later successful empty snapshot removes every previous dynamic entry.
  applyActiveModelDirectory([]);
  assert.equal(getModelById(model.id),undefined);
  assert.equal(families.imageModelCatalog.familyById.has(image.id),false);
  assert.equal(audioModels.length,0);
});

test('published fixed output counts and declared reference fields survive Studio parameter projection',()=>{
  const [model]=publishedStudioModels({id:'new-reference-fixture',schemaVersion:2,capabilityVersion:'fixture-v2',
    generationCapabilities:[{taskType:'i2i'}],inputSchema:{type:'object',properties:{
      task_type:{const:'i2i'},num_images:{type:'integer',const:1},subject_frames:{type:'array',items:{type:'string'},'x-inputRole':'image'},
    }}});
  assert.equal(buildSupplementalInputPayload(model,{}).num_images,1);
  assert.deepEqual(buildReferenceParams(model,{imageUrls:['/api/assets/asset_fixture/download?inline=1']}),{
    subject_frames:['/api/assets/asset_fixture/download?inline=1'],
  });
});
