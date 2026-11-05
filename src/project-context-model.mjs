export const platformProjects = Object.freeze([
  Object.freeze({ id: 'th-001', name: '泰国 Araya 项目', shortName: 'Araya', country: 'TH', countryName: '泰国', code: 'TH', recordId: 'reczz28Of2Cqo3Vz', knowledgeKey: 'thailand', researchKey: 'overseas', staffingValue: '泰国A项目', planConnected: true }),
  Object.freeze({ id: 'my-001', name: '马来项目', shortName: '马来项目', country: 'MY', countryName: '马来西亚', code: 'MY', recordId: 'reczz28Of2CqqA92', knowledgeKey: 'malaysia', researchKey: 'overseas', staffingValue: '马来西亚项目', planConnected: false }),
]);

export function projectById(id) {
  const project = platformProjects.find(project => project.id === id);
  if (!project) throw Object.assign(Error('请选择有效项目。'), { status: 400, publicMessage: '请选择有效项目。' });
  return project;
}

export function projectParameter(pathname, project) {
  if (['/project-management', '/staffing-reserve', '/cross-coordination'].includes(pathname) || /^\/api\/(priorities|staffing)(?:\/|$)/.test(pathname)) return project.id;
  if (['/knowledge-sharing', '/meeting-trail', '/api/team-organization'].includes(pathname)) return project.knowledgeKey;
  if (['/','/research'].includes(pathname) || /^\/api\/research(?:\/|$)/.test(pathname)) return project.researchKey;
  return '';
}

export function projectDestination(value, project) {
  const url = new URL(value, 'https://platform.invalid');
  const parameter = projectParameter(url.pathname, project);
  if (parameter) url.searchParams.set('project', parameter);
  return url.pathname + url.search + url.hash;
}

export function matchesDocumentProject(document, key) {
  if (!key) return true;
  const scope = document.projectScope ?? (document.sourceId === 'tblIJiG3OE2QGTm8' ? document.tags?.at(-1) : '');
  const thai = ['泰国', '泰国项目', '泰国A项目', 'thailand', 'th-001'];
  const malaysia = ['马来', '马来项目', '马来西亚', '马来西亚项目', 'malaysia', 'my-001'];
  if (thai.includes(scope)) return ['thailand', 'th-001'].includes(key);
  if (malaysia.includes(scope)) return ['malaysia', 'my-001'].includes(key);
  return true;
}
