import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../static/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../static/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../static/style.css', import.meta.url), 'utf8');
const data = JSON.parse(readFileSync(new URL('../data/match-preview.json', import.meta.url), 'utf8'));
const research = JSON.parse(readFileSync(new URL('../config/match-preview-research.json', import.meta.url), 'utf8'));
const publication = JSON.parse(readFileSync(new URL('../config/match-analysis-publication.json', import.meta.url), 'utf8'));
const analysisCollector = readFileSync(new URL('../scripts/fetch-first-team-analysis.js', import.meta.url), 'utf8');
const pagesWorker = readFileSync(new URL('../cloudflare/pages-worker.js', import.meta.url), 'utf8');
const backupWorker = readFileSync(new URL('../scripts/cloudflare-worker.js', import.meta.url), 'utf8');

test('比赛前瞻是独立且显眼的第四个页面', () => {
  assert.match(html, /id="page-preview" href="\.\/\?view=preview">比赛前瞻<\/a>/);
  assert.match(html, /id="match-preview-home"/);
  assert.match(html, /class="loan-page-hero-link preview" href="\.\/\?view=preview"/);
  assert.match(app, /IS_PREVIEW_PAGE = PAGE_VIEW === 'preview'/);
  assert.match(app, /loadMatchPreviewHome/);
  assert.match(css, /body\[data-page="preview"\] \.container/);
});

test('桑德兰前瞻包含赛程、近况、重点球员和完整战术拆解', () => {
  assert.equal(data.match.id, 5795461);
  assert.equal(data.match.opponent, '桑德兰');
  assert.equal(data.match.kickoff, '2026-09-20T13:00:00.000Z');
  assert.equal(data.recent_form.length, 5);
  assert.ok(data.season_numbers.length >= 6);
  assert.ok(data.danger_players.length >= 5);
  assert.ok(data.sections.length >= 9);
  assert.match(data.sections.map((section) => section.heading).join(' '), /摆大巴|门球|4-4-2|扎卡|定位球|口子|曼城拿球|曼城丢球|开场15分钟/);
});

test('已经结束的曼市德比前瞻已移除，只展示下一场桑德兰', () => {
  assert.equal(data.featured_preview_id, 5795461);
  assert.equal(data.more_previews.length, 0);
  assert.equal(data.expires_at, '2026-09-20T15:30:00.000Z');
  assert.equal(data.default_open, true);
  assert.doesNotMatch(JSON.stringify(data), /曼市德比|老特拉福德|卡里克/);
  assert.match(app, /function matchPreviewExpiresAt\(preview\)/);
  assert.match(app, /MATCH_PREVIEW_DEFAULT_DURATION_MS/);
  assert.match(app, /matchPreviewExpiresAt\(preview\) > now/);
  assert.match(JSON.stringify(data), /勒布里斯|4-2-3-1|4-4-2|扎卡|穆基耶莱|布罗比|弱侧|第二点|定位球/);
});

test('仍在赛程中的前瞻能独立折叠，投票与评论按比赛编号隔离', () => {
  assert.match(app, /function matchPreviewEntries\(data, now = Date\.now\(\)\)/);
  assert.match(app, /function matchPreviewAccordion\(data, featuredId\)/);
  assert.match(app, /match-preview-accordion\$\{isFeatured \? ' featured' : ''\}/);
  assert.match(app, /details\.open = data\.default_open === true/);
  assert.match(app, /matchPreviewPollSection\(match\)/);
  assert.match(app, /matchDiscussionSection\('preview', match\)/);
  assert.match(css, /\.match-preview-accordion\[open\]/);
  assert.match(css, /\.match-preview-accordion-summary/);
});

test('前瞻用直接中文说明战术，不使用空泛或过度防御措辞', () => {
  const copy = JSON.stringify(data);
  assert.match(copy, /第三人|弱侧|门球|扎卡|穆基耶莱|勒布里斯|第二点/);
  assert.doesNotMatch(copy, /作为一个AI|仅供参考|不能说明|不能代替|不代表|先不下结论|先不硬评|背锅/);
  assert.ok(data.sources.length >= 4);
});

test('桑德兰前瞻使用直接中文，不保留总结提示腔', () => {
  const copy = [
    data.headline,
    data.standfirst,
    ...data.verdicts,
    data.opponent.summary,
    ...data.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
  ].join(' ');
  assert.doesNotMatch(copy, /值得注意的是|更重要的是|真正的开关|真正的下一步|最危险的错误|看起来只是|不是退缩|突然打疯了|综上所述|归根结底/);
  assert.match(app, /el\('span', null, '这场看什么'\)/);
});

test('前瞻底部接入独立赛前讨论，支持评论点赞和回复', () => {
  assert.match(app, /matchDiscussionSection\('preview', match\)/);
  assert.match(app, /开球前，你怎么看/);
  assert.match(app, /评论可以点赞，也可以回复/);
  assert.match(app, /comment_title: isPreview \? '赛前讨论' : '赛后讨论'/);
  assert.match(css, /\.match-discussion/);
  assert.match(css, /\.match-discussion-button/);
});

test('以后前瞻固定优先使用战术长文与视频，并用近期比赛核对', () => {
  const sources = JSON.stringify(research.source_priority);
  const workflow = research.workflow.join(' ');
  assert.match(sources, /Total Football Analysis/);
  assert.match(sources, /Assoanalisti/);
  assert.match(sources, /Football Made Simple/);
  assert.match(workflow, /最近5场实际比赛核对/);
  assert.match(workflow, /有球打法、无球打法、最强点、最容易被打的位置/);
  assert.match(workflow, /曼城可能怎么踢/);
  assert.match(workflow, /曼城本赛季最近3至5场正式比赛/);
});

test('赛后分析等待专业长文，并逐条回看对应前瞻后再公开', () => {
  const workflow = research.post_match_workflow.join(' ');
  assert.match(workflow, /Sky Blue Times/);
  assert.match(workflow, /逐条回看前瞻/);
  assert.match(workflow, /暂缓发布/);
  assert.equal(publication.mode, 'curated_only');
  assert.ok(publication.published_match_ids.includes('5795442'));
  assert.ok(publication.published_match_ids.includes('6106286'));
  assert.match(analysisCollector, /waiting for a curated tactical review/);
  assert.match(analysisCollector, /releasedMatchIds/);
  assert.match(analysisCollector, /filter\(\(match\) => !curatedOnly \|\| releasedMatchIds\.has\(String\(match\.id\)\)\)/);
});

test('前瞻底部有可改票的实时胜负投票', () => {
  assert.match(app, /看完这篇前瞻，你觉得曼城能拿下吗/);
  assert.match(app, /稳了，能拿下/);
  assert.match(app, /不好说，先看开场/);
  assert.match(app, /悬了，感觉要出事/);
  assert.match(app, /surveyApi\(pollId, 'POST', \{ outlook: option\.key \}\)/);
  assert.match(app, /matchPreviewPollSection\(match\)/);
  assert.match(css, /\.match-preview-poll-options/);
  for (const worker of [pagesWorker, backupWorker]) {
    assert.match(worker, /MATCH_PREVIEW_POLL_RE/);
    assert.match(worker, /options: \['win', 'unsure', 'worry'\]/);
  }
});
