import Ajv from 'ajv';

const ajv = new Ajv({ allErrors:true, strict:false, validateFormats:false, coerceTypes:false, removeAdditional:false });
const validators = new Map();

export function validateCapabilityParameters(modelId, capabilityVersion, schema, parameters) {
  if (!schema) throw Object.assign(new Error('所选模型尚未发布可核实的输入参数规范'), { code:'MODEL_CAPABILITY_UNVERIFIED' });
  const schemaKey = JSON.stringify(schema);
  let cached = validators.get(modelId);
  if (!cached || cached.version !== capabilityVersion || cached.schemaKey !== schemaKey) {
    try { cached = { version:capabilityVersion, schemaKey, validate:ajv.compile(schema) }; }
    catch { throw Object.assign(new Error('所选模型参数规范无效，请联系管理员修复后发布'), { code:'MODEL_CAPABILITY_INVALID' }); }
    validators.set(modelId,cached);
  }
  if (!cached.validate(parameters)) {
    const fields = [...new Set((cached.validate.errors || []).map(error => error.instancePath || error.dataPath || error.params?.missingProperty || error.params?.additionalProperty || '参数组合'))];
    throw Object.assign(new Error(`模型参数不符合已发布规范：${fields.join('、')}`), { code:'MODEL_PARAMETERS_INVALID', fields });
  }
}
