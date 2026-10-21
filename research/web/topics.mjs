const definitions = [
  { name: '团队与运营', topics: [['组织与人才', 'users'], ['运维与验证', 'activity'], ['运维相关', 'activity'], ['验证测试', 'check']] },
  { name: '资源与保障', topics: [['采购与应急供应', 'box'], ['驻地与人员保障', 'home']] },
  { name: '业务与合规', topics: [['属地合规', 'shield'], ['友商与市场', 'building'], ['友商相关', 'building'], ['零售相关', 'store']] },
];

export function groupTopics(categories) {
  const names = new Set(categories);
  const known = new Set(definitions.flatMap(g => g.topics.map(([name]) => name)));
  const groups = definitions.map(g => ({ name: g.name, topics: g.topics.filter(([name]) => names.has(name)).map(([name, icon]) => ({ name, icon })) }));
  const custom = [...names].filter(name => !known.has(name) && !['其他', '待确认分类'].includes(name));
  if (names.has('其他')) custom.push('其他');
  groups.push({ name: '其他专题', topics: custom.map(name => ({ name, icon: 'layers' })) });
  if (names.has('待确认分类')) groups.push({ name: '待整理', topics: [{ name: '待确认分类', icon: 'help' }] });
  return groups.filter(g => g.topics.length);
}
