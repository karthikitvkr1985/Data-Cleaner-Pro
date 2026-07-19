/**
 * Custom fetch helpers for file uploads and downloads.
 * Generated API hooks are used for standard JSON interactions,
 * but multipart/form-data and Blobs require custom fetch logic.
 */

const API_BASE = '/api';

export async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }
  
  return response.json();
}

export async function exportSession(sessionId: string, format: 'csv' | 'xlsx' = 'csv') {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/export?format=${format}`, {
    method: 'GET',
  });
  
  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`);
  }
  
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cleaned_data.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportIssuesReport(sessionId: string) {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/issues-report`, {
    method: 'GET',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch issues report: ${response.statusText}`);
  }
  
  const data = await response.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `issues_report.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function applyRecipeToNewFile(sessionId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/recipe/apply-to-new-file`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`Failed to apply recipe: ${response.statusText}`);
  }
  
  return response.json();
}

export async function exportRecipe(sessionId: string) {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/recipe/export`, {
    method: 'GET',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to export recipe: ${response.statusText}`);
  }
  
  const data = await response.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recipe.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
