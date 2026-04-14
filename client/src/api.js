const BASE = '/api';

function getToken() {
  return localStorage.getItem('fp_token');
}

async function req(method, path, body) {
  const token = getToken();
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  // Token expired or invalid — clear it and force a reload to /login
  if (res.status === 401) {
    localStorage.removeItem('fp_token');
    window.location.replace('/login');
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  // Auth (no token needed)
  login:    (body) => req('POST', '/auth/login',    body),
  register: (body) => req('POST', '/auth/register', body),

  // Entities
  getEntities:  ()         => req('GET',    '/entities'),
  getEntity:    (id)       => req('GET',    `/entities/${id}`),
  createEntity: (body)     => req('POST',   '/entities', body),
  updateEntity: (id, body) => req('PATCH',  `/entities/${id}`, body),
  deleteEntity: (id)       => req('DELETE', `/entities/${id}`),
  getChangelog: (id)       => req('GET',    `/entities/${id}/changelog`),

  // Changelog
  getChangelog: (params) => req('GET', `/changelog${params ? '?' + new URLSearchParams(params) : ''}`),

  // Admin
  getUsers:         ()                       => req('GET',    '/admin/users'),
  setUserRole:      (id, role)               => req('PATCH',  `/admin/users/${id}/role`, { role }),
  getResources:     ()                       => req('GET',    '/admin/resources'),
  getPermissions:   (params)                 => req('GET',    `/admin/permissions${params ? '?' + new URLSearchParams(params) : ''}`),
  setPermission:    (body)                   => req('PUT',    '/admin/permissions', body),
  deletePermission: (id)                     => req('DELETE', `/admin/permissions/${id}`),

  // Entity types (custom, workspace-level)
  getEntityTypes:   ()         => req('GET',    '/entity-types'),
  createEntityType: (body)     => req('POST',   '/entity-types', body),
  deleteEntityType: (id)       => req('DELETE', `/entity-types/${id}`),

  // Edges
  getEdges:   ()         => req('GET',    '/edges'),
  createEdge: (body)     => req('POST',   '/edges', body),
  updateEdge: (id, body) => req('PATCH',  `/edges/${id}`, body),
  deleteEdge: (id)       => req('DELETE', `/edges/${id}`),

  // Pipelines
  getPipelines:   ()         => req('GET',    '/pipelines'),
  getPipeline:    (id)       => req('GET',    `/pipelines/${id}`),
  createPipeline: (body)     => req('POST',   '/pipelines', body),
  updatePipeline: (id, body) => req('PATCH',  `/pipelines/${id}`, body),
  deletePipeline: (id)       => req('DELETE', `/pipelines/${id}`),

  // Pipeline membership
  addEntityToPipeline:      (pipelineId, entityId) => req('POST',   `/pipelines/${pipelineId}/entities`, { entity_id: entityId }),
  removeEntityFromPipeline: (pipelineId, entityId) => req('DELETE', `/pipelines/${pipelineId}/entities/${entityId}`),
  addEdgeToPipeline:        (pipelineId, edgeId)   => req('POST',   `/pipelines/${pipelineId}/edges`,    { edge_id: edgeId }),
  removeEdgeFromPipeline:   (pipelineId, edgeId)   => req('DELETE', `/pipelines/${pipelineId}/edges/${edgeId}`),
};
