import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./modules/userStore"
import communityReducer from "./modules/communityStore"
import resumeReducer, { bindResumeSync, resumeSyncListener, setResumeSync } from "./modules/resumeStore"
import pathReducer, { bindPathSync, pathSyncListener, setSyncState } from "./modules/pathStore"
import themeReducer from "./modules/themeStore"
import { personalDirectory } from "@/utils/personalDirectory"

const store = configureStore({
  middleware: getDefaultMiddleware => getDefaultMiddleware().prepend(pathSyncListener.middleware, resumeSyncListener.middleware),
  reducer: {
    user: userReducer,
    community: communityReducer,
    resume: resumeReducer,
    path: pathReducer,
    theme: themeReducer,
  }
})

bindPathSync((userId, sync) => store.dispatch(setSyncState({ userId, sync })))
bindResumeSync((uid, sync) => store.dispatch(setResumeSync({ uid, sync })))

let directoryUserId = ''
let lastPath: unknown, lastResume: unknown
const backupPersonalFiles = () => {
  const { user, path, resume } = store.getState()
  if (directoryUserId !== user.userId) {
    directoryUserId = user.userId
    lastPath = undefined; lastResume = undefined
    void personalDirectory.activate(user.userId)
  }
  if (path !== lastPath && path.storageUserId === user.userId && path.syncStatus !== 'loading') {
    lastPath = path
    personalDirectory.publish(user.userId, 'workspace', {
      data: { files: path.files, openTabs: path.openTabs, activeTabId: path.activeTabId, expandedFolderIds: path.expandedFolderIds, activePlan: path.activePlan, mentorId: path.mentorId },
      revision: path.revision, confirmed: path.syncStatus === 'saved',
    })
  }
  if (resume !== lastResume && resume.storageUserId === user.userId && resume.loaded && resume.syncStatus !== 'loading') {
    lastResume = resume
    personalDirectory.publish(user.userId, 'resumes', { data: { resumes: resume.resumes }, revision: resume.revision, confirmed: resume.syncStatus === 'saved' })
  }
}
store.subscribe(backupPersonalFiles)
backupPersonalFiles()

// 从 store 本身推断出 `RootState` 和 `AppDispatch` 类型
export type RootState = ReturnType<typeof store.getState>
// 推断出类型: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch

export default store;
