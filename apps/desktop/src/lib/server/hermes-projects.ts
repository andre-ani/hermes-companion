import { basename } from 'node:path';
import { HermesProjectTree, HermesProjectTreeNode, ProjectBinding, type GatewayConnection, type HermesProjectTreeNode as HermesProjectTreeNodeValue, type ProjectBinding as ProjectBindingValue } from '@hermes-companion/contracts';
import { requestHermesServe } from './hermes-serve-runs.js';
import { normalizeHermesSession } from './hermes-client.js';

type HermesProjectPayload = { active_id?: unknown; projects?: unknown[] };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function normalizeHermesProjectTreeNode(value: unknown): HermesProjectTreeNodeValue | null {
  const project = record(value);
  const id = string(project.id);
  const label = string(project.label);
  if (!id || !label) return null;
  return HermesProjectTreeNode.parse({
    id,
    label,
    path: string(project.path) || null,
    color: string(project.color) || null,
    icon: string(project.icon) || null,
    archived: project.archived === true,
    isAuto: project.isAuto === true,
    isNoProject: project.isNoProject === true,
    sessionCount: number(project.sessionCount),
    lastActive: number(project.lastActive),
    previewSessions: Array.isArray(project.previewSessions) ? project.previewSessions.flatMap((session) => {
      const normalized = normalizeHermesSession(session);
      return normalized.id ? [normalized] : [];
    }) : [],
    repos: Array.isArray(project.repos) ? project.repos.flatMap((value) => {
      const repo = record(value);
      const repoId = string(repo.id);
      const repoLabel = string(repo.label);
      if (!repoId || !repoLabel) return [];
      return [{
        id: repoId,
        label: repoLabel,
        path: string(repo.path) || null,
        sessionCount: number(repo.sessionCount),
        groups: Array.isArray(repo.groups) ? repo.groups.flatMap((value) => {
          const group = record(value);
          const groupId = string(group.id);
          const groupLabel = string(group.label);
          if (!groupId || !groupLabel) return [];
          const sessions = Array.isArray(group.sessions) ? group.sessions.flatMap((session) => {
            const normalized = normalizeHermesSession(session);
            return normalized.id ? [normalized] : [];
          }) : [];
          return [{
            id: groupId,
            label: groupLabel,
            path: string(group.path) || null,
            sessions,
            sessionCount: number(group.totalCount) || sessions.length,
            isMain: group.isMain === true,
            isHome: group.isHome === true,
            isKanban: group.isKanban === true
          }];
        }) : []
      }];
    }) : []
  });
}

export function normalizeHermesProject(value: unknown, connectionId: string): ProjectBindingValue | null {
  const project = record(value);
  const folders = Array.isArray(project.folders) ? project.folders.map(record) : [];
  const repositoryPath = string(project.primary_path) || string(folders[0]?.path);
  const id = string(project.id);
  if (!id || !repositoryPath) return null;
  return ProjectBinding.parse({
    id,
    name: string(project.name) || basename(repositoryPath),
    repositoryPath,
    remoteUrl: null,
    defaultBranch: 'main',
    connectionId,
    archived: project.archived === true
  });
}

export async function listHermesProjects(connection: GatewayConnection) {
  const payload = await requestHermesServe<HermesProjectPayload>(connection, 'projects.list', {});
  return {
    activeId: string(payload.active_id) || null,
    projects: (payload.projects ?? []).flatMap((project) => {
      const normalized = normalizeHermesProject(project, connection.id);
      return normalized ? [normalized] : [];
    })
  };
}

export async function getHermesProjectTree(connection: GatewayConnection) {
  const payload = await requestHermesServe<{ projects?: unknown[]; active_id?: unknown; scoped_session_ids?: unknown[] }>(connection, 'projects.tree', { preview_limit: 3 });
  return HermesProjectTree.parse({
    projects: (payload.projects ?? []).flatMap((project) => {
      const normalized = normalizeHermesProjectTreeNode(project);
      return normalized ? [normalized] : [];
    }),
    activeId: string(payload.active_id) || null,
    scopedSessionIds: (payload.scoped_session_ids ?? []).flatMap((id) => string(id) ? [string(id)] : [])
  });
}

export async function getHermesProjectSessions(connection: GatewayConnection, projectId: string) {
  const payload = await requestHermesServe<{ project?: unknown }>(connection, 'projects.project_sessions', { project_id: projectId });
  return payload.project ? normalizeHermesProjectTreeNode(payload.project) : null;
}

export async function createHermesProject(connection: GatewayConnection, input: { repositoryPath: string; name?: string }) {
  const repositoryPath = input.repositoryPath.trim();
  const payload = await requestHermesServe<{ project?: unknown }>(connection, 'projects.create', {
    name: input.name?.trim() || basename(repositoryPath),
    folders: [repositoryPath],
    primary_path: repositoryPath,
    use: true
  });
  const project = normalizeHermesProject(payload.project, connection.id);
  if (!project) throw new Error('Hermes did not return the created project.');
  return project;
}

export async function deleteHermesProject(connection: GatewayConnection, projectId: string) {
  await requestHermesServe(connection, 'projects.delete', { id: projectId });
}

export async function renameHermesProject(connection: GatewayConnection, projectId: string, name: string) {
  const payload = await requestHermesServe<{ project?: unknown }>(connection, 'projects.update', { id: projectId, name });
  const project = normalizeHermesProject(payload.project, connection.id);
  if (!project) throw new Error('Hermes did not return the updated project.');
  return project;
}

export async function setHermesProjectArchived(connection: GatewayConnection, projectId: string, archived: boolean) {
  await requestHermesServe(connection, 'projects.archive', { id: projectId, restore: !archived });
}
