import { readFile } from 'node:fs/promises';
import { SourceConfigSchema, type SourceConfig } from '../../contracts/index.ts';
import { RuntimeConfigError } from '../runtime/config.ts';
import { internshipProfiles, metadataSource } from './internship-profiles.ts';
import { reviewedOfficialBatch } from './reviewed-official.ts';

export async function loadTencentSource(): Promise<SourceConfig> {
  const input: unknown = JSON.parse(await readFile(new URL('../../config/sources/initial.json', import.meta.url), 'utf8'));
  if (!Array.isArray(input)) throw new RuntimeConfigError('SOURCE_CONFIG_INVALID', 'Source configuration is invalid.');
  const selected = input.filter(value => value && typeof value === 'object' && value.id === 'tencent-native');
  if (selected.length !== 1) throw new RuntimeConfigError('SOURCE_CONFIG_INVALID', 'Source configuration is invalid.');
  const metadata = selected[0];
  if (metadata.nativeSourceId !== 1 || metadata.status !== 'sample_verified') {
    throw new RuntimeConfigError('SOURCE_CONFIG_INVALID', 'Tencent source metadata is invalid.');
  }
  const source = SourceConfigSchema.parse({
    sourceId: metadata.id, kind: metadata.kind, adapter: metadata.adapter,
    entryUrl: metadata.entryUrl, allowedHosts: metadata.allowedHosts, scopeKey: metadata.scopeKey,
    recruitmentChannel: metadata.recruitmentChannel, company: metadata.company ?? null, enabled: metadata.enabled,
  });
  if (source.sourceId !== 'tencent-native' || source.adapter !== 'tencent' || source.kind !== 'enterprise' ||
      source.scopeKey !== 'tencent:native:all-categories:zh-cn' || source.recruitmentChannel !== 'social' ||
      source.company !== '腾讯' || source.entryUrl !== 'https://careers.tencent.com/' ||
      source.allowedHosts.length !== 1 || source.allowedHosts[0] !== 'careers.tencent.com') {
    throw new RuntimeConfigError('SOURCE_CONFIG_INVALID', 'Tencent source scope is invalid.');
  }
  return source;
}

const internshipIdentity: SourceConfig = {
  sourceId: 'tencent-internship', kind: 'enterprise', adapter: 'tencent-internship', company: '腾讯',
  entryUrl: 'https://join.qq.com/', allowedHosts: ['join.qq.com'], scopeKey: 'tencent:campus:internship:cn',
  recruitmentChannel: 'campus', enabled: false,
};

export function assertTencentInternshipSource(input: unknown): SourceConfig {
  const source = SourceConfigSchema.parse(input);
  if (JSON.stringify(source) !== JSON.stringify(SourceConfigSchema.parse(internshipIdentity))) {
    throw new RuntimeConfigError('SOURCE_CONFIG_INVALID', 'Tencent internship source scope is invalid.');
  }
  return source;
}

export async function loadTencentInternshipSource(): Promise<SourceConfig> {
  const input: unknown = JSON.parse(await readFile(new URL('../../config/sources/initial.json', import.meta.url), 'utf8'));
  if (!Array.isArray(input)) throw new RuntimeConfigError('SOURCE_CONFIG_INVALID', 'Source configuration is invalid.');
  const selected = input.filter(value => value && typeof value === 'object' && value.id === 'tencent-internship');
  if (selected.length !== 1 || selected[0].status !== 'sample_verified') throw new RuntimeConfigError('SOURCE_CONFIG_INVALID', 'Source configuration is invalid.');
  const metadata = selected[0];
  return assertTencentInternshipSource({
    sourceId: metadata.id, kind: metadata.kind, adapter: metadata.adapter, company: metadata.company,
    entryUrl: metadata.entryUrl, allowedHosts: metadata.allowedHosts, scopeKey: metadata.scopeKey,
    recruitmentChannel: metadata.recruitmentChannel, enabled: metadata.enabled,
  });
}

/** Every production source is selected by a reviewed repository loader. */
export async function loadTrustedSources(): Promise<SourceConfig[]> {
  return [...await Promise.all([loadTencentSource(), loadTencentInternshipSource()]), ...internshipProfiles.map(metadataSource), ...reviewedOfficialBatch().sources];
}

export async function loadMetadataSource(sourceId: string): Promise<SourceConfig> {
  if (sourceId === 'tencent-internship') return loadTencentInternshipSource();
  const source = internshipProfiles.find(profile => profile.sourceId === sourceId);
  if (!source) throw new RuntimeConfigError('SOURCE_CONFIG_INVALID', 'Metadata source is invalid.');
  return metadataSource(source);
}
