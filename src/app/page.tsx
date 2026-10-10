'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import TelegramSetup from '@/components/TelegramSetup';
import Drive from '@/components/Drive';
import {
  addDriveMemberApi,
  createDrive,
  createFolder,
  deleteItem,
  downloadItem,
  fetchItems,
  forwardItem,
  getAuthStatus,
  listDrives,
  logout,
  rescanDriveApi,
  uploadFile,
} from '@/lib/client';
import { AuthStatus, DownloadTask, Drive as SharedDrive, DriveItem, StorageStats, UploadTask } from '@/types/telegram';

const EMPTY_STATS: StorageStats = {
  usedBytes: 0,
  fileCount: 0,
  folderCount: 0,
};

const ACTIVE_DRIVE_KEY = 'telebucket:activeDriveId';

export default function Home() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [ready, setReady] = useState(false);

  const [drives, setDrives] = useState<SharedDrive[]>([]);
  const [activeDriveId, setActiveDriveId] = useState('');
  const [items, setItems] = useState<DriveItem[]>([]);
  const [stats, setStats] = useState<StorageStats>(EMPTY_STATS);
  const [path, setPath] = useState<DriveItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<UploadTask[]>([]);
  const [downloading, setDownloading] = useState<DownloadTask[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const noticeTimer = useRef<number | null>(null);

  const currentFolderId = path.length ? path[path.length - 1].id : null;
  const activeDrive = drives.find((drive) => drive.id === activeDriveId) ?? null;

  const load = useCallback(async (driveId: string, folderId: string | null, search = '') => {
    if (!driveId) {
      setItems([]);
      setStats(EMPTY_STATS);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchItems(driveId, folderId, search || undefined);
      setItems(data.items);
      setStats(data.stats);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to load files.');
    } finally {
      setLoading(false);
    }
  }, []);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const reloadDrives = useCallback(async (): Promise<SharedDrive[]> => {
    const drivesList = await listDrives();
    setDrives(drivesList);
    return drivesList;
  }, []);

  const selectDrive = useCallback(
    async (driveId: string) => {
      setActiveDriveId(driveId);
      localStorage.setItem(ACTIVE_DRIVE_KEY, driveId);
      setPath([]);
      setQuery('');
      void load(driveId, null);
    },
    [load]
  );

  const initialDrive = useCallback(
    (drivesList: SharedDrive[]): string => {
      if (!drivesList.length) return '';
      const saved = localStorage.getItem(ACTIVE_DRIVE_KEY);
      return drivesList.find((drive) => drive.id === saved)?.id ?? drivesList[0].id;
    },
    []
  );

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const status = await getAuthStatus();
        setAuth(status);
        if (status.authorized) {
          const drivesList = await reloadDrives();
          const driveId = initialDrive(drivesList);
          if (driveId) void selectDrive(driveId);
        }
      } catch (error) {
        console.error(error);
        setAuth({ configured: false, authorized: false });
      } finally {
        setReady(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [reloadDrives, selectDrive, initialDrive]);

  const handleAuthorized = async () => {
    try {
      const drivesList = await reloadDrives();
      const driveId = initialDrive(drivesList);
      if (driveId) await selectDrive(driveId);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDisconnect = async () => {
    setAuth((current) => ({ ...(current ?? { configured: true }), authorized: false, user: undefined }));
    setDrives([]);
    setActiveDriveId('');
    setItems([]);
    setStats(EMPTY_STATS);
    setPath([]);
    localStorage.removeItem(ACTIVE_DRIVE_KEY);
    try {
      await logout();
    } catch {
      // Local state is already reset.
    }
  };

  const refresh = useCallback(() => {
    void load(activeDriveId, currentFolderId, query);
  }, [activeDriveId, currentFolderId, query, load]);

  const trackUpload = (task: UploadTask) => {
    setUploading((prev) => [...prev, task]);
    return {
      id: task.id,
      progress: (fraction: number) =>
        setUploading((prev) =>
          prev.map((item) => (item.id === task.id ? { ...item, progress: fraction } : item))
        ),
      done: () =>
        setUploading((prev) =>
          prev.map((item) => (item.id === task.id ? { ...item, status: 'done' as const } : item))
        ),
      fail: (error: string) =>
        setUploading((prev) =>
          prev.map((item) =>
            item.id === task.id ? { ...item, status: 'error' as const, error } : item
          )
        ),
    };
  };

  const trackDownload = (task: DownloadTask) => {
    setDownloading((prev) => [...prev, task]);
    return {
      progress: (fraction: number) =>
        setDownloading((prev) =>
          prev.map((item) => (item.id === task.id ? { ...item, progress: fraction } : item))
        ),
      done: () =>
        setDownloading((prev) =>
          prev.map((item) =>
            item.id === task.id ? { ...item, status: 'done' as const, progress: 1 } : item
          )
        ),
      fail: (error: string) =>
        setDownloading((prev) =>
          prev.map((item) =>
            item.id === task.id ? { ...item, status: 'error' as const, error } : item
          )
        ),
    };
  };

  const clearFinished = () => {
    setTimeout(() => {
      setUploading((prev) => prev.filter((item) => item.status === 'uploading'));
      setDownloading((prev) => prev.filter((item) => item.status === 'downloading'));
    }, 6000);
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!activeDriveId) return;
    for (const file of files) {
      const tracker = trackUpload({ id: crypto.randomUUID(), name: file.name, status: 'uploading' });
      try {
        await uploadFile(activeDriveId, file, currentFolderId, (fraction) =>
          tracker.progress(fraction)
        );
        tracker.done();
      } catch (error) {
        tracker.fail(error instanceof Error ? error.message : 'Upload failed');
      }
    }
    clearFinished();
    refresh();
  };

  const handleUploadFolder = async (files: File[]) => {
    if (!activeDriveId) return;
    const folderIds = new Map<string, string | null>();

    const ensureFolder = async (folderPath: string): Promise<string | null> => {
      if (!folderPath) return currentFolderId;
      if (folderIds.has(folderPath)) return folderIds.get(folderPath) ?? null;

      const segments = folderPath.split('/');
      const name = segments[segments.length - 1];
      const parentPath = segments.slice(0, -1).join('/');
      const parentId = await ensureFolder(parentPath);
      const folder = await createFolder(activeDriveId, name, parentId);
      folderIds.set(folderPath, folder.id);
      return folder.id;
    };

    for (const file of files) {
      const relative =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const segments = relative.split('/');
      const dirPath = segments.slice(0, -1).join('/');
      const tracker = trackUpload({ id: crypto.randomUUID(), name: file.name, status: 'uploading' });
      try {
        const parentId = await ensureFolder(dirPath);
        await uploadFile(activeDriveId, file, parentId, (fraction) =>
          tracker.progress(fraction)
        );
        tracker.done();
      } catch (error) {
        tracker.fail(error instanceof Error ? error.message : 'Upload failed');
      }
    }
    clearFinished();
    refresh();
  };

  const handleCreateFolder = async (name: string) => {
    if (!activeDriveId) return;
    try {
      await createFolder(activeDriveId, name, currentFolderId);
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create folder.');
    }
  };

  const handleDelete = async (item: DriveItem) => {
    try {
      await deleteItem(item.id);
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete item.');
    }
  };

  const handleDownload = async (item: DriveItem) => {
    const tracker = trackDownload({
      id: crypto.randomUUID(),
      name: item.name,
      status: 'downloading',
      progress: 0,
    });
    try {
      await downloadItem(item, (fraction) => tracker.progress(fraction));
      tracker.done();
    } catch (error) {
      tracker.fail(error instanceof Error ? error.message : 'Download failed');
    }
    clearFinished();
  };

  const handleNavigate = (folder: DriveItem | null) => {
    setQuery('');
    if (!folder) {
      setPath([]);
      void load(activeDriveId, null);
      return;
    }
    const index = path.findIndex((entry) => entry.id === folder.id);
    const next = index >= 0 ? path.slice(0, index + 1) : [...path, folder];
    setPath(next);
    void load(activeDriveId, folder.id);
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    void load(activeDriveId, currentFolderId, value);
  };

  const handleCreateDrive = async (title: string) => {
    const drive = await createDrive(title);
    const updated = await reloadDrives();
    if (!updated.some((entry) => entry.id === drive.id)) {
      updated.unshift(drive);
      setDrives(updated);
    }
    await selectDrive(drive.id);
  };

  const handleAddMember = async (driveId: string, phone: string) => {
    await addDriveMemberApi(driveId, phone);
    const drive = drives.find((entry) => entry.id === driveId);
    showNotice(`Member added to “${drive?.title ?? 'this drive'}”. They can now open and upload files.`);
  };

  const handleRescan = async () => {
    if (!activeDriveId) return;
    try {
      const added = await rescanDriveApi(activeDriveId);
      showNotice(added > 0 ? `Found ${added} new file${added === 1 ? '' : 's'} in this drive.` : 'This drive is up to date.');
      refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to scan the drive.');
    }
  };

  const handleForward = async (item: DriveItem, toDriveId: string) => {
    await forwardItem(item, toDriveId);
    const target = drives.find((drive) => drive.id === toDriveId);
    showNotice(`Copied “${item.name}” to “${target?.title ?? 'target drive'}”.`);
    if (toDriveId === activeDriveId) {
      refresh();
    }
  };

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-gray-400">Loading...</div>;
  }

  if (!auth?.authorized) {
    return (
      <TelegramSetup
        status={auth}
        onAuthorized={(status) => {
          setAuth(status);
          void handleAuthorized();
        }}
      />
    );
  }

  return (
    <Drive
      items={items}
      stats={stats}
      breadcrumb={path}
      uploading={uploading}
      downloading={downloading}
      loading={loading}
      user={displayUser(auth)}
      drives={drives}
      activeDrive={activeDrive}
      notice={notice}
      onNavigate={handleNavigate}
      onDownload={handleDownload}
      onDelete={handleDelete}
      onForward={handleForward}
      onUploadFiles={handleUploadFiles}
      onUploadFolder={handleUploadFolder}
      onCreateFolder={handleCreateFolder}
      onSearch={handleSearch}
onSelectDrive={selectDrive}
        onCreateDrive={handleCreateDrive}
        onAddMember={handleAddMember}
        onRescan={handleRescan}
        onLogout={handleDisconnect}
      />
  );
}

function displayUser(auth: AuthStatus): string {
  const user = auth.user;
  if (user?.firstName) return [user.firstName, user.lastName].filter(Boolean).join(' ');
  if (user?.username) return user.username;
  return auth.phone || 'Telegram';
}