import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { message } from 'antd';
import SubArticleList from '@/components/subArticleList';
import type { IArticleItem } from '@/components/subArticleList';
import { getReadingHistoryAPI, deleteHistoryAPI, moveHistoryToFolderAPI } from '@/api/community';

const HistoryContent = () => {
  const navigate = useNavigate();
  const [list, setList] = useState<IArticleItem[]>([]);
  const [count, setCount] = useState(0);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [date, setDate] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const res: any = await getReadingHistoryAPI({
        page: 1,
        pageSize: 50,
        folder_id: activeFolderId ?? undefined,
        keyword: keyword || undefined,
        sort,
        date: date || undefined,
      });
      if (res?.data) {
        setList(res.data.list || []);
        setCount(res.data.count || 0);
      }
    } catch { /* ignore */ }
  }, [activeFolderId, keyword, sort, date]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleDelete = async (id: number) => {
    try {
      const res: any = await deleteHistoryAPI(id);
      if (res?.message) {
        message.success('已删除');
        fetchList();
      }
    } catch {
      message.error('删除失败');
    }
  };

  const handleContinueRead = (postId: number) => {
    window.open(`/community/${postId}`);
  };

  const handleMoveToFolder = async (id: number, folderId: number | null) => {
    try {
      const res: any = await moveHistoryToFolderAPI(id, folderId);
      if (res?.message) {
        message.success('归类成功');
        fetchList();
      }
    } catch {
      message.error('归类失败');
    }
  };

  return (
    <div>
      <SubArticleList
        headerTitle="阅读历史"
        headerDesc="看过的内容都在这里"
        title="全部历史"
        count={count}
        folderType="history"
        searchPlaceholder="搜索浏览过的文章..."
        emptyTitle="还没有浏览记录"
        emptyDesc="去社区逛逛，发现感兴趣的内容"
        onEmptyBtnClick={() => navigate('/community')}
        list={list}
        onSearch={setKeyword}
        onFolderChange={setActiveFolderId}
        onSortChange={setSort}
        onDateChange={setDate}
        onContinueRead={handleContinueRead}
        onMoveToFolder={handleMoveToFolder}
        onDelete={handleDelete}
        deleteTooltip="删除阅读记录"
      />
    </div>
  );
};

export default HistoryContent;