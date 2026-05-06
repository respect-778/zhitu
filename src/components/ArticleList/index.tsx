import { ConfigProvider, Pagination, Skeleton } from 'antd';
import styles from './index.module.less';
import { CommentOutlined, HeartFilled, HeartOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { formatDateTime } from '@/utils/formatDateTime';
import zhCN from 'antd/lib/locale/zh_CN';
import type { IUserInfo } from '@/types/user';

interface ArticleListProps {
  content: any[];
  userInfo: IUserInfo;
  loading: boolean;
  activeTab: string;
  pageParams: {
    pageNum: number;
    pageSize: number;
    total: number;
  };
  isEmpty: boolean;
  handleDetail: (id: number) => void;
  handleLike: (id: number, isLiked: boolean) => void;
  handleCollection: (id: number, isCollected: boolean) => void;
  handlePageSize: (page: number, pageSize: number, activeTab: string) => void;
}


const ArticleList = ({ content, userInfo, loading, activeTab, pageParams, isEmpty, handleDetail, handleLike, handleCollection, handlePageSize }: ArticleListProps) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className={styles.middleHeader}>
        <div className={styles.subTitle}>精选内容</div>
        <div style={{ fontSize: '13px', color: '#8e9aa7' }}>/</div>
        <div style={{ fontSize: '13px', color: '#8e9aa7' }}>从公共质量池中挑出的高质量内容</div>
      </div>
      <div style={{ borderBottom: '1px solid #b4b4bd80' }}></div>
      {content.length !== 0 &&
        <div className={styles.feed}>
          {
            content.map(item => {
              return (
                <Skeleton key={item.id} loading={loading} active avatar>
                  <div className={styles.cardSty}>
                    <div className={styles.content}>
                      <div onClick={() => handleDetail(item.id!)}>
                        <div className={styles.cardTop}>
                          {item.cover ?
                            <div><img src={item.cover} alt="封面" className={styles.cardCover} /></div>
                            :
                            <div><img src={userInfo.data.avatar || './imgs/admin.png'} alt="头像" className={styles.cardAvatar} /></div>
                          }
                          <div className={styles.cardContent}>
                            <div className={styles.titleContainer}><div className={styles.cardTitle}>{item.title}</div></div>
                            <div className={styles.userInfo}>
                              <div className={styles.cardName}>{item.name}</div>
                              <div className={styles.cardTime}>{formatDateTime(item.time)}</div>
                            </div>
                            <div className={styles.contentContainer}><div className={styles.contentSty}>{item.abstract}</div></div>
                          </div>
                        </div>
                      </div>
                      <div className={styles.cardBottom}>
                        <div className={`${styles.actionItem} ${item.isLiked ? styles.active : ''}`} onClick={() => handleLike(item.id!, item.isLiked)}>
                          {item.isLiked ? <HeartFilled /> : <HeartOutlined />}
                          <span>{item.likes}</span>
                        </div>
                        <div className={`${styles.actionItem} ${item.isCollected ? styles.active : ''}`} onClick={() => handleCollection(item.id!, item.isCollected)}>
                          {item.isCollected ? <StarFilled /> : <StarOutlined />}
                          <span>{item.collection}</span>
                        </div>
                        <div className={styles.actionItem}> <CommentOutlined /> {item.comments}</div>
                      </div>
                    </div>
                  </div>
                </Skeleton>
              )
            })
          }
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div className={styles.pagination}>
              <ConfigProvider locale={zhCN}>
                <Pagination onChange={(page, pageSize) => handlePageSize(page, pageSize, activeTab)} current={pageParams.pageNum} pageSize={pageParams.pageSize} total={pageParams.total} />
              </ConfigProvider>
            </div>
          </div>
        </div>
      }

      {isEmpty ?
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', width: '100%', height: '800px' }}>
          <div><img style={{ width: '300px' }} src="imgs/empty.png" alt="404" draggable="false" /></div>
          <div style={{ display: 'flex', fontSize: '18px' }}>抱歉没有找到相关的内容</div>
        </div> : ''
      }
    </div>
  )
}

export default ArticleList