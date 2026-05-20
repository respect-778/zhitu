import { useCallback, useEffect, useState } from 'react';
import { ConfigProvider, Pagination, Skeleton } from 'antd';
import { CalendarOutlined, ThunderboltOutlined } from '@ant-design/icons';
import zhCN from 'antd/lib/locale/zh_CN';
import { getWeeklyDigestAPI } from '@/api/community';
import type { IWeeklyItem } from '@/types/community';
import styles from './index.module.less';

const PAGE_SIZE = 10;

const WeeklyDigest = () => {
  const [list, setList] = useState<IWeeklyItem[]>([]); // 精选周刊列表
  const [loading, setLoading] = useState(false); // 加载状态
  const [pageParams, setPageParams] = useState({ pageNum: 1, pageSize: PAGE_SIZE, total: 0 }); // 分页参数

  // 获取精选周刊
  const getWeeklyDigest = useCallback(async (pageNum: number, pageSize: number) => {
    setLoading(true);
    try {
      const res = await getWeeklyDigestAPI({ pageNum, pageSize });
      const data = res.data;
      setList(data.list);
      setPageParams({ pageNum: data.pageNum, pageSize: data.pageSize, total: data.total });
    } catch (error) {
      console.error('获取精选周刊失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getWeeklyDigest(1, PAGE_SIZE);
  }, [getWeeklyDigest]);

  const handlePageChange = (page: number, pageSize: number) => {
    getWeeklyDigest(page, pageSize);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDetail = (postId: number) => {
    window.open(`/community/${postId}`);
  };

  return (
    <div className={styles.container}>
      {/* 头部 */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.title}> 精选周刊</div>
          <div className={styles.subTitle}>/</div>
          <div className={styles.subTitle}>每周高质量内容回顾</div>
        </div>
      </div>
      <div className={styles.divider}></div>

      {/* 列表 */}
      {loading && list.length === 0 ? (
        <div className={styles.feed}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.card}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </div>
          ))}
        </div>
      ) : list.length > 0 ? (
        <div className={styles.feed}>
          {list.map((item, index) => {
            const isLatest = pageParams.pageNum === 1 && index === 0;
            return (
              <div
                key={item.postId}
                className={styles.card}
                onClick={() => handleDetail(item.postId)}
              >
                {/* 标题行 */}
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitleRow}>
                    {isLatest && (
                      <span className={styles.latestBadge}>
                        <ThunderboltOutlined /> 最新一期
                      </span>
                    )}
                    <div className={styles.cardTitle}>
                      Knowvia 第 {item.issueNumber} 期：{item.title}
                    </div>
                  </div>
                  <div className={styles.cardDate}>
                    <CalendarOutlined />
                    {item.date}
                  </div>
                </div>

                {/* 欢迎词 */}
                <div className={styles.cardWelcome}>
                  大家好！欢迎阅读 Knowvia 第 {item.issueNumber} 期精选文章推荐。
                </div>

                {/* 摘要 */}
                {item.abstract && (
                  <div className={styles.cardAbstract}>
                    {item.abstract}
                  </div>
                )}
              </div>
            );
          })}

          {/* 分页 */}
          {pageParams.total > PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
              <ConfigProvider locale={zhCN}>
                <Pagination
                  onChange={handlePageChange}
                  current={pageParams.pageNum}
                  pageSize={pageParams.pageSize}
                  total={pageParams.total}
                />
              </ConfigProvider>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.empty}>
          <img src="imgs/empty.png" alt="暂无数据" draggable="false" />
          <div className={styles.emptyText}>暂无精选周刊内容</div>
        </div>
      )
      }
    </div >
  );
};

export default WeeklyDigest;
