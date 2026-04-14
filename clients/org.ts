
import { API_BASE, handleResponse, getAuthHeaders, getHeaders } from './base';
import { Department, DepartmentMember, DepartmentMemberImportCommitResponse, DepartmentMemberImportPreviewResponse, Project, SecurityProject } from '../types/types';

export interface UserPermissionInfo {
  user_id: number;
  is_admin: boolean;
  platform_role: 'super_admin' | 'ordinary_admin' | 'ordinary_user';
  department_ids: number[];
  manageable_department_ids: number[];
  department_structure_manageable_ids: number[];
  role_names: string[];
  can_access_user_management: boolean;
  can_manage_users: boolean;
  can_manage_roles: boolean;
  can_manage_departments: boolean;
  can_manage_department_members: boolean;
  can_manage_org_projects: boolean;
}

/**
 * 项目空间项目列表响应格式（适配组织架构页面使用）
 * 项目空间API: GET /api/project 返回 { total: number, projects: SecurityProject[] }
 */
export interface ProjectSpaceListResponse {
  total: number;
  projects: SecurityProject[];
}

const toProjectDepartment = (departmentId?: number, departmentName?: string): Department[] =>
  departmentId && departmentName
    ? [{
        id: departmentId,
        name: departmentName,
        created_at: '',
        updated_at: '',
      }]
    : [];

export const orgApi = {
  // 用户权限接口
  getUserPermissions: async (): Promise<UserPermissionInfo> => {
    const response = await fetch(`${API_BASE}/api/auth/org/user-permissions`, { headers: getHeaders() });
    return handleResponse(response);
  },

  // 获取用户部门相关项目列表（从project服务获取）
  listUserDepartmentProjects: async (): Promise<{ total: number; projects: Project[] }> => {
    const response = await fetch(`${API_BASE}/api/auth/org/user-department-projects`, { headers: getHeaders() });
    const data = await handleResponse(response);
    return {
      total: data.total || 0,
      projects: (data.projects || []).map((p: any) => ({
        id: p.id,
        project_space_id: p.id,
        name: p.name,
        description: p.description,
        is_public: p.is_public,
        department_id: p.department_id,
        department_name: p.department_name,
        can_manage: p.can_manage,
        created_at: p.created_at,
        updated_at: p.updated_at,
        owner_id: p.owner_id,
        owner_name: p.owner_name,
        owner_department_id: p.owner_department_id,
        owner_department_name: p.owner_department_name,
        roles: p.roles || [],
        departments: p.org_departments?.length ? p.org_departments : toProjectDepartment(p.department_id, p.department_name),
        org_id: p.org_id ?? undefined,
      }))
    };
  },

  // 部门管理接口
  listDepartments: async (): Promise<Department[]> => {
    const response = await fetch(`${API_BASE}/api/auth/org/departments`, { headers: getHeaders() });
    return handleResponse(response);
  },

  createDepartment: async (payload: { name: string; description?: string; parent_id?: number }): Promise<Department> => {
    const response = await fetch(`${API_BASE}/api/auth/org/departments`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  getDepartment: async (departmentId: number): Promise<Department> => {
    const response = await fetch(`${API_BASE}/api/auth/org/departments/${departmentId}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  updateDepartment: async (departmentId: number, payload: { name?: string; description?: string; parent_id?: number }): Promise<Department> => {
    const response = await fetch(`${API_BASE}/api/auth/org/departments/${departmentId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  deleteDepartment: async (departmentId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/org/departments/${departmentId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  // 部门成员管理接口
  getDepartmentMembers: async (departmentId: number): Promise<DepartmentMember[]> => {
    const response = await fetch(`${API_BASE}/api/auth/org/departments/${departmentId}/members`, { headers: getHeaders() });
    return handleResponse(response);
  },

  addDepartmentMember: async (payload: { user_id: number; department_id: number; role: string }): Promise<DepartmentMember> => {
    const response = await fetch(`${API_BASE}/api/auth/org/department-members`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  updateDepartmentMember: async (memberId: number, payload: { role?: string; department_id?: number }): Promise<DepartmentMember> => {
    const response = await fetch(`${API_BASE}/api/auth/org/department-members/${memberId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  removeDepartmentMember: async (memberId: number): Promise<any> => {
    const response = await fetch(`${API_BASE}/api/auth/org/department-members/${memberId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  downloadDepartmentMemberImportTemplate: async (): Promise<Blob> => {
    const response = await fetch(`${API_BASE}/api/auth/org/department-members/import/template`, {
      headers: {
        ...getAuthHeaders(),
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });
    if (!response.ok) {
      await handleResponse(response);
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
      await handleResponse(response);
    }
    return response.blob();
  },

  previewDepartmentMemberImport: async (payload: { department_id: number; csv_content?: string; file_content_base64?: string; filename?: string; mode?: 'skip_existing' | 'update_role' }): Promise<DepartmentMemberImportPreviewResponse> => {
    const response = await fetch(`${API_BASE}/api/auth/org/department-members/import/preview`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  commitDepartmentMemberImport: async (payload: { department_id: number; csv_content?: string; file_content_base64?: string; filename?: string; mode?: 'skip_existing' | 'update_role' }): Promise<DepartmentMemberImportCommitResponse> => {
    const response = await fetch(`${API_BASE}/api/auth/org/department-members/import/commit`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  // 项目管理接口 - 从组织架构系统获取（保留原有功能）
  listOrgProjects: async (): Promise<Project[]> => {
    const response = await fetch(`${API_BASE}/api/auth/org/projects`, { headers: getHeaders() });
    return handleResponse(response);
  },

  // 通过名称获取组织架构项目（用于与项目空间关联）
  getOrgProjectByName: async (name: string): Promise<Project | null> => {
    const response = await fetch(`${API_BASE}/api/auth/org/projects/by-name/${encodeURIComponent(name)}`, { headers: getHeaders() });
    if (!response.ok) {
      return null;
    }
    return handleResponse(response);
  },

  // 项目管理接口 - 从项目空间系统获取（新的数据源）
  listProjects: async (): Promise<Project[]> => {
    const response = await fetch(`${API_BASE}/api/project`, { headers: getHeaders() });
    const data: ProjectSpaceListResponse = await handleResponse(response);
    // 将项目空间的项目数据转换为组织架构页面使用的格式
    return (data.projects || []).map((p: SecurityProject) => ({
      id: p.id,  // 保留字符串ID，用于项目空间操作
      name: p.name,
      description: p.description || '',
      is_public: !!p.is_public,
      department_id: p.department_id ?? undefined,
      department_name: p.department_name ?? undefined,
      can_manage: p.can_manage ?? false,
      created_at: p.created_at || new Date().toISOString(),
      updated_at: p.updated_at || new Date().toISOString(),
      departments: toProjectDepartment(p.department_id, p.department_name),
      project_space_id: p.id  // 保存项目空间ID
    }));
  },

  createProject: async (payload: { name: string; description?: string; is_public: boolean; department_ids?: number[]; department_id?: number }): Promise<Project> => {
    let orgProjectData = null;

    try {
      // 1. 先在项目空间创建项目
      const projectSpaceResponse = await fetch(`${API_BASE}/api/project`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          is_public: payload.is_public,
          department_id: payload.department_id ?? payload.department_ids?.[0]
        }),
      });
      await handleResponse(projectSpaceResponse);
    } catch (error) {
      console.error('创建项目空间项目失败:', error);
      // 继续尝试在组织架构创建，以便用户可以看到错误
    }

    try {
      // 2. 同时在组织架构系统创建项目记录（用于部门绑定）
      const orgResponse = await fetch(`${API_BASE}/api/auth/org/projects`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          is_public: payload.is_public,
          department_ids: payload.department_ids
        }),
      });
      orgProjectData = await handleResponse(orgResponse);
    } catch (error) {
      console.error('创建组织架构项目失败:', error);
      // 如果两个系统都失败了，抛出错误
      if (!orgProjectData) {
        throw error;
      }
    }

    // 返回组织架构系统的项目数据（包含部门信息）
    return orgProjectData;
  },

  getProject: async (projectId: number): Promise<Project> => {
    const response = await fetch(`${API_BASE}/api/auth/org/projects/${projectId}`, { headers: getHeaders() });
    return handleResponse(response);
  },

  updateProject: async (projectId: number | string, payload: { name?: string; description?: string; is_public?: boolean; department_id?: number }, orgProjectId?: number): Promise<Project> => {
    const projectIdStr = String(projectId);
    let orgResult = null;

    try {
      // 1. 更新项目空间的项目信息
      const projectSpaceResponse = await fetch(`${API_BASE}/api/project/${projectIdStr}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          is_public: payload.is_public,
          department_id: payload.department_id
        }),
      });
      await handleResponse(projectSpaceResponse);
    } catch (error) {
      console.error('更新项目空间项目失败:', error);
    }

    // 只有当提供了有效的组织架构ID时才更新组织架构系统
    if (orgProjectId !== undefined && orgProjectId !== null) {
      try {
        // 2. 更新组织架构系统的项目信息
        const response = await fetch(`${API_BASE}/api/auth/org/projects/${orgProjectId}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });
        orgResult = await handleResponse(response);
      } catch (error) {
        console.error('更新组织架构项目失败:', error);
        if (!orgResult) {
          throw error;
        }
      }
    }

    return orgResult;
  },

  deleteProject: async (projectId: number | string, orgProjectId?: number): Promise<any> => {
    const projectIdStr = String(projectId);
    let orgResult = null;

    try {
      // 1. 从项目空间删除项目
      const projectSpaceResponse = await fetch(`${API_BASE}/api/project/${projectIdStr}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      await handleResponse(projectSpaceResponse);
    } catch (error) {
      console.error('删除项目空间项目失败:', error);
    }

    // 只有当提供了有效的组织架构ID时才删除组织架构系统记录
    if (orgProjectId !== undefined && orgProjectId !== null) {
      try {
        // 2. 从组织架构系统删除项目
        const response = await fetch(`${API_BASE}/api/auth/org/projects/${orgProjectId}`, {
          method: 'DELETE',
          headers: getHeaders(),
        });
        orgResult = await handleResponse(response);
      } catch (error) {
        console.error('删除组织架构项目失败:', error);
        if (!orgResult) {
          throw error;
        }
      }
    }

    return orgResult;
  }
};
