import type { ExportData } from './exportService';

const BACKUP_FILENAME = 'smartmeetings-backup.json';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

class GoogleDriveService {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenClient: google.accounts.oauth2.TokenClient | null = null;
  private pendingResolve: ((token: string) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;

  initialize(clientId: string): void {
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        if (resp.error) {
          this.pendingReject?.(new Error(resp.error));
          this.pendingResolve = null;
          this.pendingReject = null;
          return;
        }
        this.accessToken = resp.access_token;
        this.tokenExpiresAt = Date.now() + resp.expires_in * 1000;
        this.pendingResolve?.(resp.access_token);
        this.pendingResolve = null;
        this.pendingReject = null;
      },
    });
  }

  requestAccessToken(): Promise<string> {
    if (!this.tokenClient) {
      return Promise.reject(new Error('Google Drive not initialized. Set Client ID in Settings.'));
    }

    return new Promise<string>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      // If we already have a valid token, try silent refresh
      if (this.accessToken && this.tokenExpiresAt > Date.now()) {
        resolve(this.accessToken);
        this.pendingResolve = null;
        this.pendingReject = null;
        return;
      }

      // If previously consented, try silent refresh (prompt: '')
      if (this.accessToken) {
        this.tokenClient!.requestAccessToken({ prompt: '' });
      } else {
        this.tokenClient!.requestAccessToken();
      }
    });
  }

  isSignedIn(): boolean {
    return !!this.accessToken && this.tokenExpiresAt > Date.now();
  }

  signOut(): void {
    if (this.accessToken) {
      google.accounts.oauth2.revoke(this.accessToken);
    }
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  private async getToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt > Date.now()) {
      return this.accessToken;
    }
    return this.requestAccessToken();
  }

  private async findBackupFile(token: string): Promise<string | null> {
    const query = `name='${BACKUP_FILENAME}' and trashed=false`;
    const resp = await fetch(
      `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,modifiedTime)&spaces=drive`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok) throw new Error(`Drive search failed: ${resp.status}`);
    const data = await resp.json();
    return data.files?.[0]?.id ?? null;
  }

  async uploadBackup(data: object): Promise<void> {
    const token = await this.getToken();
    const fileId = await this.findBackupFile(token);
    const jsonBody = JSON.stringify(data);

    if (fileId) {
      // Update existing file
      const resp = await fetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: jsonBody,
      });
      if (!resp.ok) throw new Error(`Drive upload failed: ${resp.status}`);
    } else {
      // Create new file with multipart upload
      const metadata = JSON.stringify({ name: BACKUP_FILENAME, mimeType: 'application/json' });
      const boundary = 'smartmeetings_boundary';
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonBody}\r\n` +
        `--${boundary}--`;

      const resp = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });
      if (!resp.ok) throw new Error(`Drive create failed: ${resp.status}`);
    }
  }

  async downloadBackup(): Promise<ExportData | null> {
    const token = await this.getToken();
    const fileId = await this.findBackupFile(token);
    if (!fileId) return null;

    const resp = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`Drive download failed: ${resp.status}`);
    return resp.json();
  }

  async getBackupInfo(): Promise<{ lastModified: string } | null> {
    const token = await this.getToken();
    const query = `name='${BACKUP_FILENAME}' and trashed=false`;
    const resp = await fetch(
      `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,modifiedTime)&spaces=drive`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok) throw new Error(`Drive query failed: ${resp.status}`);
    const data = await resp.json();
    if (!data.files?.[0]) return null;
    return { lastModified: data.files[0].modifiedTime };
  }
}

export const googleDriveService = new GoogleDriveService();
