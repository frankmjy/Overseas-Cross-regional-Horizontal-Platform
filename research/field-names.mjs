// 远端显示名称与内部模型分离；旧名称、双语名称及绑定字段 ID 均可读取。
export const fieldNames = {
  "适用范围": "Applicability（适用范围）",
  "事项": "Item（事项）",
  "说明": "Description（说明）",
  "迁移键": "Migration Key（迁移键）",
  "分类待确认": "Category Pending Confirmation（分类待确认）",
  "源行号": "Source Row（源行号）",
  "一级分类": "Primary Category（一级分类）",
  "重点标记": "Priority Flag（重点标记）",
  "问题编号": "Question ID（问题编号）",
  "问题列表": "Question（问题列表）",
  "原序号": "Original No.（原序号）",
  "源表链接": "Source Table URL（源表链接）",
  "已删除": "Deleted（已删除）",
  "调研内容": "Research Findings（调研内容）",
  "明细名称": "Detail Title（明细名称）",
  "源举证单元格": "Source Evidence Cell（源举证单元格）",
  "明细编号": "Detail ID（明细编号）",
  "关联问题": "Related Question（关联问题）",
  "材料状态": "Evidence Status（材料状态）",
  "源内容单元格": "Source Content Cell（源内容单元格）",
  "举证原文": "Evidence Excerpt（举证原文）",
  "调研对象": "Research Subject（调研对象）",
  "SHA256": "SHA-256（文件哈希）",
  "所属明细": "Related Detail（所属明细）",
  "MIME类型": "MIME Type（MIME类型）",
  "迁移状态": "Migration Status（迁移状态）",
  "资料名称": "Evidence Title（资料名称）",
  "资料编号": "Evidence ID（资料编号）",
  "原始链接": "Original URL（原始链接）",
  "原文件大小": "Original File Size（原文件大小）",
  "源单元格": "Source Cell（源单元格）",
  "原文件标识": "Original File Token（原文件标识）",
  "资料类型": "Evidence Type（资料类型）",
  "附件": "Attachments（附件）",
  "专题名称": "Topic Name（专题名称）",
  "专题说明": "Topic Description（专题说明）"
};
const aliases = new Map(Object.entries(fieldNames).flatMap(([key, label]) => [[key, key], [label, key]]));
export const canonicalFieldName = name => aliases.get(name) || name;
export function normalizeRecord(row, fieldIds = {}) {
  const ids = new Map(Object.entries(fieldIds).map(([name, id]) => [id, name]));
  const normalized = {};
  for (const [name, value] of Object.entries(row)) {
    const key = ids.get(name) || canonicalFieldName(name);
    if (Object.hasOwn(normalized, key)) throw new Error(`飞书字段映射重复：${key}，请核对列名。`);
    normalized[key] = value;
  }
  return normalized;
}
export function encodeFields(fields, fieldIds = {}) {
  const encoded = {};
  for (const [name, value] of Object.entries(fields)) {
    const key = fieldIds[canonicalFieldName(name)] || name;
    if (Object.hasOwn(encoded, key)) throw new Error(`飞书写入字段重复：${name}。`);
    encoded[key] = value;
  }
  return encoded;
}
