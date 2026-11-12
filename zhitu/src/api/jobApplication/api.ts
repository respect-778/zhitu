import { createReader } from '@/utils/jobApplication/reader';
import type { JobPlatform } from '@/utils/jobApplication/platforms';
export type { Catalogue, ReaderStatus } from '@/utils/jobApplication/reader';
export { effectiveFilters, initialFilters, jobLink, sameQuery, salaryConversionDescription, salarySortDescription, type Filters, type Job } from '@/utils/jobApplication/model';

const readers = { boss: createReader('boss'), zhaopin: createReader('zhaopin'), liepin: createReader('liepin') };
export const { request, listJobs, sessionJobs, restoreCachedJobs, setReaderEnabled, pauseForJobNavigation } = readers.boss;
export const getPlatformReader = (platform: JobPlatform) => readers[platform];
export const restoreAllCachedJobs = async () => { await Promise.all(Object.values(readers).map(reader => reader.restoreCachedJobs())); };
export const allSessionJobs = () => Object.values(readers).flatMap(reader => reader.sessionJobs());
