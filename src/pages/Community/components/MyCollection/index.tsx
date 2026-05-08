import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { message } from 'antd';
import SubArticleList from '@/components/subArticleList';
import type { IArticleItem } from '@/components/subArticleList';
import { getCollectionListAPI, deleteCollectionAPI, moveCollectionToFolderAPI } from '@/api/community';

const MyCollection = () => {
  const navigate = useNavigate();
  const [list, setList] = useState<IArticleItem[]>([]);
  const [count, setCount] = useState(0);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [date, setDate] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const res: any = await getCollectionListAPI({
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
      const res: any = await deleteCollectionAPI(id);
      if (res?.message) {
        message.success('已移除收藏');
        fetchList();
      }
    } catch {
      message.error('操作失败');
    }
  };

  const handleContinueRead = (postId: number) => {
    window.open(`/community/${postId}`);
  };

  const handleMoveToFolder = async (id: number, folderId: number | null) => {
    try {
      const res: any = await moveCollectionToFolderAPI(id, folderId);
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
        headerTitle="我的收藏"
        headerDesc="值得反复回来的内容"
        title="全部收藏"
        count={count}
        folderType="collection"
        searchPlaceholder="搜索收藏的文章..."
        emptyTitle="还没有收藏任何内容"
        emptyDesc="在阅读文章时点击收藏按钮，好内容不会错过"
        onEmptyBtnClick={() => navigate('/community')}
        list={list}
        onSearch={setKeyword}
        onFolderChange={setActiveFolderId}
        onSortChange={setSort}
        onDateChange={setDate}
        onContinueRead={handleContinueRead}
        onMoveToFolder={handleMoveToFolder}
        onDelete={handleDelete}
        deleteTooltip="移除收藏"
      />
    </div>
  );
};

export default MyCollection;