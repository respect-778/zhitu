import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Select, Space, Tag, message } from 'antd'
import {
  AimOutlined,
  BookOutlined,
  CheckOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  HeartOutlined,
  LeftOutlined,
  MailOutlined,
  ReadOutlined,
  RightOutlined,
  StarOutlined,
  TagsOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router'
import {
  generateLearningKeywordsAPI,
  getLearningPreferencesAPI,
  getUserInfoAPI,
  getUserProfileAPI,
  updateLearningPreferencesAPI,
} from '@/api/user'
import { followCommunityAPI, getReadingHistoryAPI, getUserPostsAPI } from '@/api/community'
import type { IArticleItem, IContent, IUserProfile } from '@/types/community'
import type { ILearningPreferences, IUserInfo } from '@/types/user'
import { formatDateTime } from '@/utils/formatDateTime'
import { resolveMediaUrl } from '@/utils/resolveMediaUrl'
import styles from './index.module.less'

interface UserProfileProps {
  userId: number
  isSelf?: boolean
}

type PreferenceSyncState = 'idle' | 'saving' | 'saved' | 'error'

const { TextArea } = Input
const MAX_KEYWORDS = 20

const EMPTY_PREFERENCES: ILearningPreferences = {
  direction: '',
  stage: '',
  goal: '',
  keywords: [],
}

const stageOptions = [
  { label: '探索方向', value: '探索方向' },
  { label: '学习基础', value: '学习基础' },
  { label: '课程学习', value: '课程学习' },
  { label: '项目实践', value: '项目实践' },
  { label: '准备实习', value: '准备实习' },
  { label: '准备求职', value: '准备求职' },
]

const normalizeKeywords = (values: string[]): string[] => {
  const seen = new Set<string>()
  return values
    .map(value => Array.from(value.trim()).slice(0, 24).join(''))
    .filter(value => {
      const key = value.toLocaleLowerCase()
      if (!value || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const UserProfile = ({ userId, isSelf = false }: UserProfileProps) => {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<IUserProfile | null>(null)
  const [userInfo, setUserInfo] = useState<IUserInfo['data'] | null>(null)
  const [hotArticle, setHotArticle] = useState<IContent | null>(null)
  const [articles, setArticles] = useState<IContent[]>([])
  const [topReadArticles, setTopReadArticles] = useState<IArticleItem[]>([])
  const [loading, setLoading] = useState(true)

  const [preferenceDraft, setPreferenceDraft] = useState<ILearningPreferences>(EMPTY_PREFERENCES)
  const [keywordDraft, setKeywordDraft] = useState<string[]>([])
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([])
  const [generatingKeywords, setGeneratingKeywords] = useState(false)
  const [preferenceSyncState, setPreferenceSyncState] = useState<PreferenceSyncState>('idle')
  const preferencesLoadedRef = useRef(false)
  const lastSavedPreferencesRef = useRef('')
  const latestPreferencesRef = useRef('')
  const preferenceSaveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const carouselRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [maxScroll, setMaxScroll] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setProfile(null)
    setHotArticle(null)
    setArticles([])
    setTopReadArticles([])
    preferencesLoadedRef.current = false

    const loadSelfProfile = async () => {
      const [profileResponse, userResponse, preferenceResponse, historyResponse] = await Promise.all([
        getUserProfileAPI(userId),
        getUserInfoAPI(),
        getLearningPreferencesAPI(),
        getReadingHistoryAPI({ page: 1, pageSize: 20, sort: 'most_read' }),
      ])
      if (cancelled) return

      const loadedPreferences = preferenceResponse.data || EMPTY_PREFERENCES
      const serializedPreferences = JSON.stringify(loadedPreferences)
      setProfile(profileResponse.data)
      setUserInfo(userResponse.data)
      setPreferenceDraft({ ...loadedPreferences, keywords: [...loadedPreferences.keywords] })
      setKeywordDraft([...loadedPreferences.keywords])
      setTopReadArticles(historyResponse.data?.list || [])
      lastSavedPreferencesRef.current = serializedPreferences
      latestPreferencesRef.current = serializedPreferences
      preferencesLoadedRef.current = true
      setPreferenceSyncState('saved')
    }

    const loadPublicProfile = async () => {
      const [profileResponse, hotResponse, articleResponse] = await Promise.all([
        getUserProfileAPI(userId),
        getUserPostsAPI(userId, { sort: 'hot', pageNum: 1, pageSize: 1 }),
        getUserPostsAPI(userId, { sort: 'new', pageNum: 1, pageSize: 20 }),
      ])
      if (cancelled) return

      setProfile(profileResponse.data)
      setHotArticle(hotResponse?.data?.list?.[0] || null)
      setArticles(articleResponse?.data?.list || [])
    }

    void (isSelf ? loadSelfProfile() : loadPublicProfile())
      .catch(() => {
        if (!cancelled) message.error('获取用户资料失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isSelf, userId])

  useEffect(() => {
    if (!isSelf || !preferencesLoadedRef.current) return

    const nextPreferences: ILearningPreferences = {
      direction: preferenceDraft.direction,
      stage: preferenceDraft.stage,
      goal: preferenceDraft.goal,
      keywords: keywordDraft,
    }
    const serializedPreferences = JSON.stringify(nextPreferences)
    latestPreferencesRef.current = serializedPreferences
    if (serializedPreferences === lastSavedPreferencesRef.current) return

    setPreferenceSyncState('saving')
    const timer = window.setTimeout(() => {
      preferenceSaveQueueRef.current = preferenceSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          await updateLearningPreferencesAPI(nextPreferences)
          lastSavedPreferencesRef.current = serializedPreferences
          if (latestPreferencesRef.current === serializedPreferences) {
            setPreferenceSyncState('saved')
          }
        })
        .catch(() => {
          if (latestPreferencesRef.current === serializedPreferences) {
            setPreferenceSyncState('error')
          }
        })
    }, 700)

    return () => window.clearTimeout(timer)
  }, [isSelf, keywordDraft, preferenceDraft.direction, preferenceDraft.goal, preferenceDraft.stage])

  useEffect(() => {
    const el = carouselRef.current
    if (!el) return

    const calculateScroll = () => {
      setMaxScroll(Math.max(0, el.scrollWidth - el.clientWidth))
      setScrollLeft(el.scrollLeft)
    }
    const frameId = window.requestAnimationFrame(calculateScroll)
    const observer = new ResizeObserver(calculateScroll)
    observer.observe(el)

    return () => {
      window.cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [articles, isSelf, loading, topReadArticles])

  const selectedSuggestionKeys = useMemo(
    () => new Set(keywordDraft.map(item => item.toLocaleLowerCase())),
    [keywordDraft],
  )
  const canGenerateKeywords = Boolean(preferenceDraft.direction || preferenceDraft.stage || preferenceDraft.goal)

  const updateKeywordDraft = (values: string[]) => {
    const normalized = normalizeKeywords(values)
    if (normalized.length > MAX_KEYWORDS) message.warning(`最多使用 ${MAX_KEYWORDS} 个关键词`)
    setKeywordDraft(normalized.slice(0, MAX_KEYWORDS))
  }

  const handleGenerateKeywords = async () => {
    if (!canGenerateKeywords) return
    setGeneratingKeywords(true)
    try {
      const response = await generateLearningKeywordsAPI({
        direction: preferenceDraft.direction,
        stage: preferenceDraft.stage,
        goal: preferenceDraft.goal,
      })
      setKeywordSuggestions(response.data || [])
    } catch {
      message.error('关键词生成暂不可用，请稍后重试')
    } finally {
      setGeneratingKeywords(false)
    }
  }

  const toggleKeywordSuggestion = (keyword: string, checked: boolean) => {
    if (!checked) {
      setKeywordDraft(current => current.filter(item => item.toLocaleLowerCase() !== keyword.toLocaleLowerCase()))
      return
    }
    if (keywordDraft.length >= MAX_KEYWORDS) {
      message.warning(`最多使用 ${MAX_KEYWORDS} 个关键词`)
      return
    }
    updateKeywordDraft([...keywordDraft, keyword])
  }

  const useAllKeywordSuggestions = () => {
    const nextKeywords = normalizeKeywords([...keywordDraft, ...keywordSuggestions])
    if (nextKeywords.length > MAX_KEYWORDS) message.warning(`最多使用 ${MAX_KEYWORDS} 个关键词`)
    setKeywordDraft(nextKeywords.slice(0, MAX_KEYWORDS))
  }

  const handleScroll = () => {
    const el = carouselRef.current
    if (!el) return
    setScrollLeft(el.scrollLeft)
    setMaxScroll(Math.max(0, el.scrollWidth - el.clientWidth))
  }

  const scrollBy = (direction: 'left' | 'right') => {
    const el = carouselRef.current
    if (!el) return
    el.scrollBy({ left: direction === 'left' ? -768 : 768, behavior: 'smooth' })
  }

  const handleFollow = async () => {
    if (!profile) return
    const action = profile.isFollowed ? 'unfollow' : 'follow'
    try {
      const response = await followCommunityAPI(profile.id, action)
      setProfile(current => current ? {
        ...current,
        isFollowed: response.data.isFollowed,
        fans_count: response.data.fans_count,
      } : current)
    } catch {
      message.error('操作失败')
    }
  }

  const goArticle = (articleId?: number) => {
    if (articleId) window.open(`/community/${articleId}`)
  }

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.skeletonHeader} />
        <div className={styles.skeletonHot} />
        <div className={styles.skeletonCarousel}>
          {[1, 2, 3, 4].map(item => <div key={item} className={styles.skeletonCard} />)}
        </div>
      </div>
    )
  }

  if (!profile) {
    return <div className={styles.wrapper}><div className={styles.emptyState}>用户不存在</div></div>
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.profileCard}>
        {isSelf && <div className={styles.cardEyebrow}>基本信息</div>}
        <div className={styles.header}>
          <img
            src={profile.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}
            alt={profile.username}
            className={styles.avatar}
            onError={event => {
              (event.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'
            }}
          />
          <div className={styles.headerInfo}>
            <div className={styles.usernameRow}>
              <div className={styles.username}>{profile.username}</div>
              {isSelf && (
                <button className={styles.editProfileBtn} type="button" onClick={() => navigate('/setting#account')}>
                  <EditOutlined /> 编辑基本资料
                </button>
              )}
            </div>

            <div className={styles.statsRow}>
              {isSelf && userInfo ? (
                <>
                  <span className={styles.statChip}><UserOutlined /> {userInfo.follow_count} 关注</span>
                  <span className={styles.statDot}>·</span>
                  <span className={styles.statChip}><TeamOutlined /> {userInfo.fans_count} 粉丝</span>
                  <span className={styles.statDot}>·</span>
                  <span className={styles.statChip}><StarOutlined /> {userInfo.favorites_count} 收藏</span>
                </>
              ) : (
                <>
                  <span className={styles.statChip}><FileTextOutlined /> {profile.art_count} 篇文章</span>
                  <span className={styles.statDot}>·</span>
                  <span className={styles.statChip}><TeamOutlined /> {profile.fans_count} 粉丝</span>
                  <span className={styles.statDot}>·</span>
                  <span className={styles.statChip}><HeartOutlined /> {profile.like_count} 获赞</span>
                </>
              )}
            </div>

            {isSelf && userInfo && (userInfo.email || userInfo.degree) && (
              <div className={styles.basicMeta}>
                {userInfo.email && <span><MailOutlined /> {userInfo.email}</span>}
                {userInfo.degree && <span><BookOutlined /> {userInfo.degree}</span>}
              </div>
            )}
            {profile.bio && <div className={styles.bio}>{profile.bio}</div>}

            {!isSelf && (
              <button
                className={`${styles.followBtn} ${profile.isFollowed ? styles.followed : ''}`}
                type="button"
                onClick={() => { void handleFollow() }}
              >
                {profile.isFollowed ? <><CheckOutlined /> 已关注</> : <><UserAddOutlined /> 关注</>}
              </button>
            )}
          </div>
        </div>
      </section>

      {isSelf && (
        <>
          <section className={styles.profileSection}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionTitleGroup}>
                <span className={styles.sectionIcon}><AimOutlined /></span>
                <div>
                  <div className={styles.sectionTitle}>成长方向</div>
                  <div className={styles.sectionSubtitle}>选填，修改后会自动同步到设置</div>
                </div>
              </div>
              {(preferenceSyncState === 'saving' || preferenceSyncState === 'error') && (
                <span
                  className={`${styles.syncStatus} ${styles[preferenceSyncState]}`}
                  aria-live="polite"
                >
                  {preferenceSyncState === 'saving' ? '正在同步' : '同步失败'}
                </span>
              )}
            </div>

            <div className={styles.growthForm}>
              <label>
                <span>专业或发展方向</span>
                <Input
                  value={preferenceDraft.direction}
                  maxLength={80}
                  placeholder="如：软件工程、前端开发"
                  onChange={event => setPreferenceDraft(current => ({ ...current, direction: event.target.value }))}
                />
              </label>
              <label>
                <span>当前阶段</span>
                <Select
                  allowClear
                  value={preferenceDraft.stage || undefined}
                  placeholder="请选择当前阶段"
                  options={stageOptions}
                  onChange={value => setPreferenceDraft(current => ({ ...current, stage: value || '' }))}
                />
              </label>
              <label className={styles.goalField}>
                <span>近期目标</span>
                <TextArea
                  value={preferenceDraft.goal}
                  maxLength={50}
                  autoSize={{ minRows: 2, maxRows: 3 }}
                  placeholder="用一句话描述近期想完成的事情"
                  onChange={event => setPreferenceDraft(current => ({ ...current, goal: event.target.value }))}
                />
              </label>
            </div>
          </section>

          <section className={styles.profileSection}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionTitleGroup}>
                <span className={styles.sectionIcon}><TagsOutlined /></span>
                <div>
                  <div className={styles.sectionTitle}>内容偏好</div>
                  <div className={styles.sectionSubtitle}>这些关键词会影响知识广场的内容推荐，最多 {MAX_KEYWORDS} 个</div>
                </div>
              </div>
            </div>

            <div className={styles.keywordEditor}>
              <Select
                mode="tags"
                className={styles.keywordSelect}
                open={false}
                suffixIcon={null}
                value={keywordDraft}
                tokenSeparators={[',', '，']}
                placeholder="输入关键词后按回车添加"
                options={[]}
                onChange={updateKeywordDraft}
              />
              <div className={styles.keywordActions}>
                <span>{keywordDraft.length}/{MAX_KEYWORDS}</span>
                <Button
                  size="small"
                  disabled={!canGenerateKeywords}
                  loading={generatingKeywords}
                  onClick={() => { void handleGenerateKeywords() }}
                >
                  AI 生成
                </Button>
              </div>

              {keywordSuggestions.length > 0 && (
                <div className={styles.suggestionArea}>
                  <div className={styles.suggestionHeader}>
                    <span>AI 推荐关键词</span>
                    <Space size={4}>
                      <Button type="link" size="small" onClick={() => setKeywordSuggestions([])}>取消</Button>
                      <Button type="link" size="small" onClick={useAllKeywordSuggestions}>全部使用</Button>
                    </Space>
                  </div>
                  <div className={styles.suggestionTags}>
                    {keywordSuggestions.map(keyword => (
                      <Tag.CheckableTag
                        key={keyword}
                        className={styles.suggestionTag}
                        checked={selectedSuggestionKeys.has(keyword.toLocaleLowerCase())}
                        onChange={checked => toggleKeywordSuggestion(keyword, checked)}
                      >
                        {keyword}
                      </Tag.CheckableTag>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={styles.profileSection}>
            <div className={styles.sectionHeading}>
              <div className={styles.sectionTitleGroup}>
                <span className={styles.sectionIcon}><ReadOutlined /></span>
                <div>
                  <div className={styles.sectionTitle}>最常阅读</div>
                  <div className={styles.sectionSubtitle}>按阅读次数排序，仅你自己可见</div>
                </div>
              </div>
            </div>

            {topReadArticles.length > 0 ? (
              <div className={styles.carouselBody}>
                {scrollLeft > 0 && (
                  <button className={`${styles.navBtn} ${styles.navLeft}`} type="button" aria-label="向左浏览" onClick={() => scrollBy('left')}>
                    <LeftOutlined />
                  </button>
                )}
                {scrollLeft < maxScroll - 1 && maxScroll > 0 && (
                  <button className={`${styles.navBtn} ${styles.navRight}`} type="button" aria-label="向右浏览" onClick={() => scrollBy('right')}>
                    <RightOutlined />
                  </button>
                )}
                <div className={styles.carouselTrack} ref={carouselRef} onScroll={handleScroll}>
                  {topReadArticles.map(article => (
                    <article key={article.id} className={styles.articleCard} onClick={() => goArticle(article.post_id)}>
                      {article.cover ? (
                        <img src={resolveMediaUrl(article.cover)} alt="" className={styles.articleCover} loading="lazy" decoding="async" />
                      ) : (
                        <div className={styles.articleCoverPlaceholder}><ReadOutlined /></div>
                      )}
                      <div className={styles.articleContent}>
                        <div className={styles.articleTitle}>{article.title || '无标题'}</div>
                        <div className={styles.articleMeta}>
                          阅读 {article.read_count || 0} 次 · 最近 {formatDateTime(article.last_read_at || '')}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.emptyArticles}>
                <ReadOutlined className={styles.emptyIcon} />
                <div>还没有阅读记录</div>
              </div>
            )}
          </section>
        </>
      )}

      {!isSelf && hotArticle && (
        <section className={styles.hotSection}>
          <div className={styles.sectionTitle}>最受欢迎</div>
          <div className={styles.hotCard} onClick={() => goArticle(hotArticle.id)}>
            {hotArticle.cover ? (
              <img src={resolveMediaUrl(hotArticle.cover)} alt="" className={styles.hotCover} />
            ) : (
              <div className={styles.hotCoverPlaceholder}><ReadOutlined /></div>
            )}
            <div className={styles.hotInfo}>
              <div className={styles.hotTitle}>{hotArticle.title || '无标题'}</div>
              <div className={styles.hotMeta}>
                <span>{profile.username}</span>
                <span className={styles.statDot}>·</span>
                <span><EyeOutlined /> {hotArticle.Pageviews} 次浏览</span>
                <span className={styles.statDot}>·</span>
                <span>{formatDateTime(hotArticle.time)}</span>
              </div>
              <div className={styles.hotAbstract}>{hotArticle.abstract}</div>
            </div>
          </div>
        </section>
      )}

      {!isSelf && articles.length > 0 && (
        <section className={styles.carouselSection}>
          <div className={styles.sectionTitle}>最新文章</div>
          <div className={styles.carouselBody}>
            {scrollLeft > 0 && (
              <button className={`${styles.navBtn} ${styles.navLeft}`} type="button" aria-label="向左浏览" onClick={() => scrollBy('left')}>
                <LeftOutlined />
              </button>
            )}
            {scrollLeft < maxScroll - 1 && maxScroll > 0 && (
              <button className={`${styles.navBtn} ${styles.navRight}`} type="button" aria-label="向右浏览" onClick={() => scrollBy('right')}>
                <RightOutlined />
              </button>
            )}
            <div className={styles.carouselTrack} ref={carouselRef} onScroll={handleScroll}>
              {articles.map(article => (
                <article key={article.id} className={styles.articleCard} onClick={() => goArticle(article.id)}>
                  {article.cover ? (
                    <img src={resolveMediaUrl(article.cover)} alt="" className={styles.articleCover} loading="lazy" decoding="async" />
                  ) : (
                    <div className={styles.articleCoverPlaceholder}><ReadOutlined /></div>
                  )}
                  <div className={styles.articleContent}>
                    <div className={styles.articleTitle}>{article.title || '无标题'}</div>
                    <div className={styles.articleMeta}>
                      <EyeOutlined /> {article.Pageviews} 次浏览 · {formatDateTime(article.time)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {!isSelf && !hotArticle && articles.length === 0 && (
        <div className={styles.emptyArticles}>
          <ReadOutlined className={styles.emptyIcon} />
          <div>该用户还没有发布任何文章</div>
        </div>
      )}
    </div>
  )
}

export default UserProfile
