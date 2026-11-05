const bindings=[
 ['specialty','flduzZLPbb','Specialty（专业）'],
 ['sequence','fldNI4XUNW','Sequence（序号）'],['capacity','fldjM0dmu7','Project Capacity MW（兆瓦数·项目填写）'],['buildingCount','fldo5aRL8y','Campus Building Count（园区楼栋数量·项目填写）'],
 ['primary','fld5aa4dit','Primary Category（一级分类）'],['category','fld0p7eqsW','Secondary Category（二级分类）'],['name','fldoMkSJ3j','Item Name（名称）'],['brand','flddLBajY2','Reference Brand（参考品牌）'],['model','fldWwoin43','Reference Model（参考型号）'],
 ['region','fldHecDQpI','Applicable Region（适用区域）'],['architecture','fld6ebCKYE','Applicable Architecture（适用架构）'],['requirement','fldVM1MMiS','Configuration Requirement（配置说明）'],['unitPrice','fld6tgcr2t','Reference Unit Price（参考单价）'],
 ['level','fldA0verzE','Configuration Level（配置方式）'],['buildingQuantity','fldqy9SPEO','Building Quantity（楼栋）'],['campusQuantity','fldTP9qtwc','Campus Quantity（园区）'],['cityQuantity','fldf6C48vC','City Quantity（城市单体）'],['unit','fldnjbFNIk','Unit（单位）'],
 ['guidance','fldMU7r48l','Quantity Guidance（配置数量参考方式说明）'],['listCategory','fldSK4tGZq','List Category（清单类别）'],['referenceAmount','fldFlJ0mau','Reference Amount（参考数量价格）'],['totalReferenceAmount','fldY3XswNZ','Total Reference Amount（物资总价）'],
 ['modification','fld0hMUqyD','Modification Status（是否修改）'],['actualBuildingQuantity','fld3lszvSM','Actual Building Quantity（楼栋·实际数量）'],['actualCampusQuantity','fldwtcRD8O','Actual Campus Quantity（园区·实际数量）'],['actualAmount','fldGhcHxJS','Actual Amount（实际数量价格）'],['totalActualAmount','fld5picMzx','Total Actual Amount（实际物资总价）']
];
export const materials={id:'materials',name:'海外开办物资',appId:'cli_aa547c8de6785ce2',baseToken:'CID8b8V7CaCtKesWGFKcHTdqnlc',table:'tbl80fQ4HVz6mKLU',view:'vewo7CQOT5',importKey:{id:'fldfQ0sXEo',name:'Import Key（导入键）'},fields:Object.fromEntries(bindings.map(([key,id,name])=>[key,{id,name}]))};
export const platforms=[{id:materials.id,name:materials.name}];
export const materialsUrl=`https://vnet.feishu.cn/base/${materials.baseToken}?table=${materials.table}&view=${materials.view}`;
