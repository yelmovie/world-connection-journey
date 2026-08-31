import type { Page } from '../router';
import type { MissionId } from '../types';
import { assetUrl, hasAsset } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { writeMissionArtifact } from '../core/missionArtifacts';
import { saveRepo } from '../core/SaveRepository';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow } from '../ui/feedback';
import { openModal } from '../ui/modal';

type Hotspot = { id: string; x: number; y: number; label: string };
type Area = { id: string; name: string; short: string; description: string; x: number; y: number; color: string };
type Example = {
  id: string;
  areaId: string;
  country: string;
  place: string;
  scope: string;
  sourceTitle: string;
  sourceUrl: string;
  sceneIds: string[];
};
type Scene = {
  id: string;
  exampleId: string;
  category: string;
  categoryLabel: string;
  title: string;
  assetId: string;
  summary: string;
  detail: string;
  discovery: string;
  hotspots: Hotspot[];
  sourceTitle?: string;
  sourceUrl?: string;
};
type Signal = {
  id: string;
  title: string;
  prompt: string;
  connection: string;
  beforeAssetId: string;
  afterAssetId: string;
  sourceTitle: string;
  sourceUrl: string;
};
type Perspective = { id: string; name: string; role: string; line: string; worry: string; assetId: string };
type Action = { id: string; tier: string; label: string; detail: string };

interface RegionalModel {
  id: Extract<MissionId, 'asia' | 'oceania'>;
  title: string;
  subtitle: string;
  guide: string;
  backgroundId: string;
  mapAssetId: string;
  bgm: 'asia' | 'oceania';
  areaLabel: string;
  areas: Area[];
  examples: Example[];
  scenes: Scene[];
  signals: Signal[];
  perspectives: Perspective[];
  actions: Action[];
  requirements: { minAreas: number; minExamples: number; minDiscoveries: number; minSignals: number };
}

interface RegionalState {
  screen: 'explore' | 'connections';
  activeAreaId: string | null;
  activeExampleId: string | null;
  visitedAreaIds: string[];
  viewedExampleIds: string[];
  viewedSceneIds: string[];
  discoveredSignalIds: string[];
  listenedPerspectiveIds: string[];
  selectedActionIds: string[];
}

interface AsiaSource {
  intro: { title: string; subtitle: string; guide: string };
  requirements: { minRegions: number; minExamples: number; minDiscoveries: number; minSignals: number };
  regions: Array<{ id: string; nameKo: string; silhouette: string; mapPosition: { xPercent: number; yPercent: number } }>;
  countryExamples: Array<{ id: string; regionId: string; countryNameKo: string; placeNameKo: string; scopeNoteKo: string; sourceTitle: string; sourceUrl: string; sceneIds: string[] }>;
  scenes: Array<{ id: string; exampleId: string; category: string; titleKo: string; imageAssetId: string; summaryKo: string; detailKo: string; discoveryKo: string; hotspots: Array<{ id: string; x: number; y: number; labelKo: string }>; sourceTitle?: string; sourceUrl?: string }>;
  signals: Array<{ id: string; titleKo: string; promptKo: string; connectionTypes: string[]; beforeAssetId: string; afterAssetId: string; sourceTitle: string; sourceUrl: string }>;
  perspectives: Array<{ id: string; nameKo: string; labelKo: string; lineKo: string; worryKo: string; assetId: string }>;
  actions: Array<{ id: string; tier: string; nameKo: string; detailKo: string }>;
}

interface OceaniaSource {
  intro: { title: string; subtitle: string; guide: string };
  requirements: { minZones: number; minExamples: number; minDiscoveries: number; minSignals: number };
  zones: Array<{ id: string; name: string; short: string; x: number; y: number; color: string; description: string }>;
  countryExamples: Array<{ id: string; zoneId: string; country: string; place: string; scopeNote: string; sourceTitle: string; sourceUrl: string }>;
  scenes: Array<{ id: string; zoneId: string; exampleId: string; category: string; categoryLabel: string; title: string; assetId: string; summary: string; detail: string; discovery: string; hotspots: Hotspot[]; sourceTitle?: string; sourceUrl?: string }>;
  signals: Array<{ id: string; title: string; prompt: string; connectionType: string; connectionNote: string; beforeAssetId: string; afterAssetId: string; sourceTitle: string; sourceUrl: string }>;
  perspectives: Array<{ id: string; name: string; role: string; line: string; imageId: string }>;
  actions: Array<{ id: string; tier: string; label: string; metrics: Record<string, number> }>;
}

const COLORS = ['#3979c8', '#16a39b', '#e79b2f', '#8b64c6', '#d85f7b'];

const PAGE_CSS = `
.regional-mission{background-position:center;background-size:cover;color:var(--c-ink)}
.regional-mission .top-bar{background:linear-gradient(180deg,rgba(10,46,78,.94),rgba(10,46,78,.62))}
.regional-mission .regional-body{min-height:0;padding:14px clamp(12px,2vw,28px);overflow:auto}
.regional-shell{width:min(1500px,100%);min-height:calc(100dvh - var(--top-bar-h) - var(--bottom-bar-h) - 28px);margin:auto;display:grid;grid-template-columns:minmax(520px,1.5fr) minmax(330px,.72fr);gap:14px}
.regional-map,.regional-side,.regional-connections{border:2px solid rgba(255,255,255,.78);border-radius:28px;box-shadow:0 18px 45px rgba(7,31,54,.28);overflow:hidden}
.regional-map{position:relative;min-height:0;aspect-ratio:16/9;background-color:#1689c7;background-position:center;background-repeat:no-repeat;background-size:contain;isolation:isolate}
.regional-map::after{content:"";position:absolute;inset:0;background:linear-gradient(rgba(2,42,70,.05),rgba(2,42,70,.28));pointer-events:none}
.regional-map-note{position:absolute;z-index:2;left:18px;bottom:18px;max-width:min(520px,72%);padding:10px 14px;border-radius:16px;background:rgba(255,253,246,.92);font-weight:800;line-height:1.4}
.regional-pin{position:absolute;z-index:3;left:var(--x);top:var(--y);transform:translate(-50%,-50%);min-width:104px;min-height:62px;padding:7px 12px;border:3px solid #fff;border-radius:22px;background:var(--pin);color:#fff;font:800 18px/1.1 var(--font-head);box-shadow:0 7px 0 rgba(7,38,62,.28),0 12px 25px rgba(5,30,50,.28)}
.regional-pin small{display:block;margin-top:4px;font:700 13px/1.1 var(--font-body)}
.regional-pin.is-active{outline:5px solid rgba(255,203,67,.85);transform:translate(-50%,-54%) scale(1.05)}
.regional-pin.is-visited::after{content:"✓";position:absolute;right:-8px;top:-10px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#1b9b68;border:2px solid #fff}
.regional-country-shortcut{position:absolute;z-index:4;left:84%;top:52%;transform:translate(-50%,-50%);padding:8px 12px;border:3px solid #fff;border-radius:18px;background:#fff8d9;color:#123c5b;font:900 16px/1.15 var(--font-head);box-shadow:0 6px 0 #d49b28,0 12px 22px rgba(5,30,50,.3)}
.regional-country-shortcut small{display:block;margin-top:3px;color:#76531c;font:800 12px/1.1 var(--font-body)}
.regional-country-shortcut.is-active{outline:5px solid rgba(255,203,67,.85);transform:translate(-50%,-54%) scale(1.05)}
.regional-side{padding:18px;background:rgba(255,253,247,.96);display:flex;flex-direction:column;gap:12px;min-height:0}
.regional-side h2,.regional-connections h2{font-family:var(--font-head);font-size:clamp(25px,2.2vw,34px);color:var(--c-navy)}
.regional-side p{line-height:1.5}
.regional-example-list{display:grid;gap:8px;max-height:210px;overflow:auto;padding:2px}
.regional-example{justify-content:flex-start;text-align:left;min-height:58px;padding:9px 13px;border-radius:16px}
.regional-example span{display:block;font:700 14px/1.3 var(--font-body);color:var(--c-ink-soft)}
.regional-photo-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.regional-photo{position:relative;min-width:0;padding:0;overflow:hidden;border:2px solid transparent;border-radius:18px;background:#d9edf2;box-shadow:var(--shadow-card);cursor:pointer}
.regional-photo img{width:100%;aspect-ratio:4/3;display:block;object-fit:cover}
.regional-photo strong{display:block;padding:8px 7px;font-size:14px;line-height:1.25}
.regional-photo.is-viewed{border-color:var(--c-success)}
.regional-photo.is-viewed::after{content:"✓";position:absolute;right:7px;top:7px;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:var(--c-success);color:#fff;font-weight:900}
.regional-source{margin-top:auto;padding-top:10px;border-top:1px solid var(--c-line);font-size:14px;line-height:1.4}
.regional-source a{color:#165ca9;font-weight:800}
.regional-dock{background:rgba(10,42,68,.9);align-items:center}
.regional-dock [data-next]{margin-left:auto}
.regional-connections{grid-column:1/-1;padding:18px;background:rgba(255,253,247,.97);overflow:auto}
.regional-connection-layout{display:grid;grid-template-columns:1.12fr .88fr;gap:16px}
.regional-section{display:grid;gap:10px;align-content:start}
.regional-signal-grid,.regional-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.regional-signal,.regional-choice{text-align:left;padding:12px;min-height:78px;border-radius:18px}
.regional-choice{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:10px}
.regional-choice img{width:54px;height:64px;object-fit:contain}
.regional-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.regional-action{text-align:left;padding:10px;border-radius:16px;min-height:66px}
.regional-media-note{font-size:13px;color:var(--c-ink-soft);font-weight:700}
.regional-modal{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(270px,1.1fr);gap:18px;max-width:820px}
.regional-modal-visual{position:relative;overflow:hidden;border-radius:22px;background:#dceff4;min-height:300px}
.regional-modal-visual img{width:100%;height:100%;object-fit:cover}
.regional-hotspot{position:absolute;left:var(--x);top:var(--y);transform:translate(-50%,-50%);width:27px;height:27px;border-radius:50%;border:3px solid #fff;background:var(--c-gold);box-shadow:0 0 0 4px rgba(24,70,103,.45)}
.regional-modal-copy{display:grid;gap:10px;align-content:start;font-size:18px;line-height:1.55}
.regional-discovery{padding:12px 14px;border-left:5px solid var(--c-turquoise);border-radius:14px;background:#eefaf7;font-weight:800}
.modal:has(.regional-modal){width:min(900px,94vw);border-radius:28px;overflow:hidden}
@media(max-width:900px){.regional-shell,.regional-connection-layout{grid-template-columns:1fr}.regional-map{min-height:520px;aspect-ratio:auto;background-size:cover}.regional-photo-grid{grid-template-columns:repeat(2,1fr)}.regional-connections{grid-column:1}.regional-modal{grid-template-columns:1fr}.regional-modal-visual{min-height:260px}}
@media(max-width:620px){.regional-shell{min-height:0}.regional-map{min-height:470px}.regional-pin{min-width:86px;font-size:15px}.regional-signal-grid,.regional-choice-grid,.regional-action-grid{grid-template-columns:1fr}.regional-photo strong{font-size:12px}}
`;

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function uniqueValid(value: unknown, valid: ReadonlySet<string>, max = 60): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && valid.has(item)))].slice(0, max);
}

function normalizeState(model: RegionalModel): RegionalState {
  const saved = saveRepo.get().missions[model.id].data as { regionalExploration?: Partial<RegionalState> };
  const raw = saved.regionalExploration ?? {};
  const areaIds = new Set(model.areas.map((item) => item.id));
  const exampleIds = new Set(model.examples.map((item) => item.id));
  const sceneIds = new Set(model.scenes.map((item) => item.id));
  const signalIds = new Set(model.signals.map((item) => item.id));
  const perspectiveIds = new Set(model.perspectives.map((item) => item.id));
  const actionIds = new Set(model.actions.map((item) => item.id));
  const activeAreaId = typeof raw.activeAreaId === 'string' && areaIds.has(raw.activeAreaId) ? raw.activeAreaId : null;
  const activeExampleId = typeof raw.activeExampleId === 'string' && exampleIds.has(raw.activeExampleId) ? raw.activeExampleId : null;
  return {
    screen: raw.screen === 'connections' ? 'connections' : 'explore',
    activeAreaId,
    activeExampleId,
    visitedAreaIds: uniqueValid(raw.visitedAreaIds, areaIds),
    viewedExampleIds: uniqueValid(raw.viewedExampleIds, exampleIds),
    viewedSceneIds: uniqueValid(raw.viewedSceneIds, sceneIds),
    discoveredSignalIds: uniqueValid(raw.discoveredSignalIds, signalIds),
    listenedPerspectiveIds: uniqueValid(raw.listenedPerspectiveIds, perspectiveIds),
    selectedActionIds: uniqueValid(raw.selectedActionIds, actionIds)
  };
}

function asiaModel(content: AsiaSource): RegionalModel {
  return {
    id: 'asia', title: content.intro.title, subtitle: content.intro.subtitle, guide: content.intro.guide,
    backgroundId: 'bg.asia', mapAssetId: 'asia.map.regional', bgm: 'asia', areaLabel: '권역',
    requirements: { minAreas: content.requirements.minRegions, minExamples: content.requirements.minExamples, minDiscoveries: content.requirements.minDiscoveries, minSignals: content.requirements.minSignals },
    areas: content.regions.map((item, index) => ({ id: item.id, name: item.nameKo, short: item.silhouette, description: `${item.nameKo}의 자연과 생활 사례를 살펴봐.`, x: item.mapPosition.xPercent, y: item.mapPosition.yPercent, color: COLORS[index % COLORS.length] ?? COLORS[0]! })),
    examples: content.countryExamples.map((item) => ({ id: item.id, areaId: item.regionId, country: item.countryNameKo, place: item.placeNameKo, scope: item.scopeNoteKo, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl, sceneIds: item.sceneIds })),
    scenes: content.scenes.map((item) => ({ id: item.id, exampleId: item.exampleId, category: item.category, categoryLabel: item.category === 'nature' ? '자연과 공간' : item.category === 'daily' ? '오늘날의 생활' : item.category === 'landmark' ? '대표 장소 관찰' : '문화와 표현', title: item.titleKo, assetId: item.imageAssetId, summary: item.summaryKo, detail: item.detailKo, discovery: item.discoveryKo, hotspots: item.hotspots.map((spot) => ({ id: spot.id, x: spot.x * 100, y: spot.y * 100, label: spot.labelKo })), sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl })),
    signals: content.signals.map((item) => ({ id: item.id, title: item.titleKo, prompt: item.promptKo, connection: item.connectionTypes.join(' · '), beforeAssetId: item.beforeAssetId, afterAssetId: item.afterAssetId, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl })),
    perspectives: content.perspectives.map((item) => ({ id: item.id, name: item.nameKo, role: item.labelKo, line: item.lineKo, worry: item.worryKo, assetId: item.assetId })),
    actions: content.actions.map((item) => ({ id: item.id, tier: item.tier, label: item.nameKo, detail: item.detailKo }))
  };
}

function oceaniaModel(content: OceaniaSource): RegionalModel {
  const scenesByZone = new Map<string, string[]>();
  for (const scene of content.scenes.filter((item) => item.category !== 'landmark')) scenesByZone.set(scene.zoneId, [...(scenesByZone.get(scene.zoneId) ?? []), scene.id]);
  return {
    id: 'oceania', title: content.intro.title, subtitle: content.intro.subtitle, guide: content.intro.guide,
    backgroundId: 'bg.oceania', mapAssetId: 'oceania.map.regional', bgm: 'oceania', areaLabel: '구역',
    requirements: { minAreas: content.requirements.minZones, minExamples: content.requirements.minExamples, minDiscoveries: content.requirements.minDiscoveries, minSignals: content.requirements.minSignals },
    areas: content.zones.map((item) => ({ id: item.id, name: item.name, short: item.short, description: item.description, x: item.x, y: item.y, color: item.color })),
    examples: content.countryExamples.map((item) => {
      const sameCountryIds = new Set(content.countryExamples.filter((candidate) => candidate.country === item.country).map((candidate) => candidate.id));
      const landmarkIds = content.scenes.filter((scene) => scene.category === 'landmark' && sameCountryIds.has(scene.exampleId)).map((scene) => scene.id);
      return { id: item.id, areaId: item.zoneId, country: item.country, place: item.place, scope: item.scopeNote, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl, sceneIds: [...(scenesByZone.get(item.zoneId) ?? []), ...landmarkIds] };
    }),
    scenes: content.scenes.map((item) => ({ id: item.id, exampleId: item.exampleId, category: item.category, categoryLabel: item.categoryLabel, title: item.title, assetId: item.assetId, summary: item.summary, detail: item.detail, discovery: item.discovery, hotspots: item.hotspots, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl })),
    signals: content.signals.map((item) => ({ id: item.id, title: item.title, prompt: item.prompt, connection: `${item.connectionType} · ${item.connectionNote}`, beforeAssetId: item.beforeAssetId, afterAssetId: item.afterAssetId, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl })),
    perspectives: content.perspectives.map((item) => ({ id: item.id, name: item.name, role: item.role, line: item.line, worry: '', assetId: item.imageId })),
    actions: content.actions.map((item) => ({ id: item.id, tier: item.tier, label: item.label, detail: '선택의 장단점을 다른 행동과 함께 비교해 봐.' }))
  };
}

function imageFor(model: RegionalModel, assetId: string): string {
  return assetUrl(hasAsset(assetId) ? assetId : model.mapAssetId);
}

function createRegionalPage(load: () => Promise<RegionalModel>): Page {
  let disposed = false;
  let closeModal: (() => void) | null = null;
  return {
    async mount(root) {
      const model = await load();
      if (disposed) return;
      audio.playBgm(model.bgm);
      const state = normalizeState(model);
      const teacherUnlocked = saveRepo.isTeacherUnlocked();
      const page = document.createElement('div');
      page.className = `page regional-mission regional-${model.id}`;
      page.style.backgroundImage = `linear-gradient(rgba(8,40,68,.24),rgba(8,40,68,.38)),url('${assetUrl(model.backgroundId)}')`;
      const style = document.createElement('style');
      style.textContent = PAGE_CSS;
      page.appendChild(style);
      const topBar = buildTopBar({ title: model.title, subtitle: model.subtitle, backTo: '#/map', steps: { total: 2, done: state.screen === 'connections' ? 1 : 0, now: state.screen === 'connections' ? 1 : 0 } });
      const body = document.createElement('main');
      body.className = 'page-body regional-body';
      const dock = document.createElement('footer');
      dock.className = 'bottom-bar regional-dock';
      page.append(topBar, body, dock);
      root.appendChild(page);

      const persist = () => saveRepo.setCheckpoint(model.id, state.screen === 'connections' ? 'regional-connections' : 'regional-explore', { regionalExploration: structuredClone(state) });
      const add = (items: string[], value: string) => { if (!items.includes(value)) items.push(value); };
      const exploreReady = () => teacherUnlocked || (state.visitedAreaIds.length >= model.requirements.minAreas && state.viewedExampleIds.length >= model.requirements.minExamples && state.viewedSceneIds.length >= model.requirements.minDiscoveries);
      const chosenTierCount = () => new Set(model.actions.filter((item) => state.selectedActionIds.includes(item.id)).map((item) => item.tier)).size;
      const finishReady = () => teacherUnlocked || (state.discoveredSignalIds.length >= model.requirements.minSignals && state.listenedPerspectiveIds.length >= 2 && state.selectedActionIds.length >= 3 && chosenTierCount() >= 2);

      const openScene = (scene: Scene) => {
        add(state.viewedSceneIds, scene.id);
        const example = model.examples.find((item) => item.id === scene.exampleId);
        persist();
        render();
        const modalBody = document.createElement('div');
        modalBody.className = 'regional-modal';
        modalBody.innerHTML = `
          <div class="regional-modal-visual">
            <img src="${imageFor(model, scene.assetId)}" alt="${esc(scene.title)} 학습용 재현 이미지">
            ${scene.hotspots.map((spot) => `<span class="regional-hotspot" style="--x:${spot.x}%;--y:${spot.y}%" title="${esc(spot.label)}" aria-label="${esc(spot.label)}"></span>`).join('')}
          </div>
          <div class="regional-modal-copy">
            <span class="chip">${esc(scene.categoryLabel)}</span>
            <h3>${esc(scene.title)}</h3>
            <p>${esc(scene.detail)}</p>
            <p class="regional-discovery">발견: ${esc(scene.discovery)}</p>
            <p>${esc(scene.category === 'landmark' && example ? `${scene.title}은 ${example.country} 안의 특정 장소 사례이며, 이 한 장면이 나라 전체의 모습을 대표하지는 않아.` : example?.scope ?? '')}</p>
            <p class="regional-media-note">실제 현장 사진이 아닌 학습용 재현 이미지야. 사람·배치·날씨는 사실 근거로 쓰지 않아.</p>
            ${scene.sourceUrl || example ? `<a href="${esc(scene.sourceUrl ?? example!.sourceUrl)}" target="_blank" rel="noreferrer">공식·공공 출처: ${esc(scene.sourceTitle ?? example!.sourceTitle)}</a>` : ''}
          </div>`;
        closeModal?.();
        closeModal = openModal({ id: `${model.id}-scene`, title: `${example ? `${example.country} · ` : ''}${scene.title}`, bodyEl: modalBody, actions: [] });
      };

      const openSignal = (signal: Signal) => {
        add(state.discoveredSignalIds, signal.id);
        persist();
        render();
        const modalBody = document.createElement('div');
        modalBody.className = 'regional-modal';
        modalBody.innerHTML = `
          <div class="regional-modal-visual"><img src="${imageFor(model, signal.afterAssetId)}" alt="${esc(signal.title)} 학습용 비교 장면"></div>
          <div class="regional-modal-copy"><span class="chip">이어진 환경 신호</span><h3>${esc(signal.title)}</h3><p>${esc(signal.prompt)}</p><p class="regional-discovery">${esc(signal.connection)}</p><p class="regional-media-note">장면은 변화를 비교하는 학습용 재현 이미지이며 실제 미래를 예측하지 않아.</p><a href="${esc(signal.sourceUrl)}" target="_blank" rel="noreferrer">출처: ${esc(signal.sourceTitle)}</a></div>`;
        closeModal?.();
        closeModal = openModal({ id: `${model.id}-signal`, title: signal.title, bodyEl: modalBody, actions: [] });
      };

      const renderDock = () => {
        if (state.screen === 'explore') {
          dock.innerHTML = `<button class="btn btn-primary" data-next ${exploreReady() ? '' : 'disabled'}>환경 연결 살펴보기 →</button>`;
          dock.querySelector('[data-next]')?.addEventListener('click', () => { state.screen = 'connections'; persist(); render(); });
        } else {
          dock.innerHTML = `<button class="btn btn-ghost" data-back>← ${model.areaLabel} 지도</button><button class="btn btn-primary" data-finish ${finishReady() ? '' : 'disabled'}>${model.title.split(':')[0]} 여행 마치기</button>`;
          dock.querySelector('[data-back]')?.addEventListener('click', () => { state.screen = 'explore'; persist(); render(); });
          dock.querySelector('[data-finish]')?.addEventListener('click', () => {
            if (!finishReady()) return;
            const heard = model.perspectives.filter((item) => state.listenedPerspectiveIds.includes(item.id));
            writeMissionArtifact({ schemaVersion: 1, missionId: model.id, title: `${model.title.split(':')[0]} 권역 탐험 기록`, purpose: '여러 지역의 자연·생활·문화를 한 모습으로 단정하지 않고 비교해.', initialHypothesis: '지도에서 서로 다른 지역의 위치와 생활을 먼저 살펴봤어.', evidenceIds: [...state.viewedSceneIds, ...state.discoveredSignalIds], evidenceLabel: `${state.visitedAreaIds.length}개 ${model.areaLabel}, ${state.viewedExampleIds.length}개 나라·장소, ${state.viewedSceneIds.length}개 장면을 확인했어.`, voiceId: heard[0]?.id ?? `${model.id}-voices`, voiceName: heard.map((item) => item.name).join('·') || '지역의 친구들', voiceLine: heard.map((item) => item.line).join(' ') || '지역마다 필요한 방법이 다르니 먼저 사정을 들어야 해.', firstDecision: '한 장면을 지역 전체의 모습으로 단정하지 않기', observedConsequence: `${state.discoveredSignalIds.length}개의 연결된 환경 신호를 확인했어.`, revisedDecision: `${state.selectedActionIds.length}개의 행동을 여러 주체의 책임으로 골랐어.`, rationale: '생활 속 행동과 지역사회·정부·기업·국가 간 협력을 함께 골라야 오래 이어질 수 있어.', transferPrompt: '우리 동네 문제에서도 당사자의 말을 듣고 여러 주체의 행동을 함께 제안한다면 무엇이 달라질까?', earnedAt: new Date().toISOString() });
            completeMissionFlow(model.id, model.title.split(':')[0] ?? model.title);
          });
        }
      };

      const renderExplore = () => {
        const area = model.areas.find((item) => item.id === state.activeAreaId) ?? null;
        const examples = area ? model.examples.filter((item) => item.areaId === area.id) : [];
        const example = model.examples.find((item) => item.id === state.activeExampleId && item.areaId === area?.id) ?? examples[0] ?? null;
        const koreaShortcut = model.id === 'asia' ? model.examples.find((item) => item.country === '대한민국') : null;
        if (example && state.activeExampleId !== example.id) state.activeExampleId = example.id;
        const scenes = example ? model.scenes.filter((item) => example.sceneIds.includes(item.id)) : [];
        body.innerHTML = `<section class="regional-shell">
          <div class="regional-map" style="background-image:url('${assetUrl(model.mapAssetId)}')" aria-label="${esc(model.title)} 권역 지도">
            ${model.areas.map((item) => `<button type="button" class="regional-pin ${state.activeAreaId === item.id ? 'is-active' : ''} ${state.visitedAreaIds.includes(item.id) ? 'is-visited' : ''}" style="--x:${item.x}%;--y:${item.y}%;--pin:${item.color}" data-area="${item.id}">${esc(item.name)}<small>${esc(item.short)}</small></button>`).join('')}
            ${koreaShortcut ? `<button type="button" class="regional-country-shortcut ${state.activeExampleId === koreaShortcut.id ? 'is-active' : ''}" data-country-shortcut="${koreaShortcut.id}">대한민국<small>서울 · 바로 보기</small></button>` : ''}
            <p class="regional-map-note">${esc(model.guide)}</p>
          </div>
          <aside class="regional-side">
            ${area ? `<span class="chip">${esc(model.areaLabel)} 탐험</span><h2>${esc(area.name)}</h2><p>${esc(area.description)}</p><div class="regional-example-list">${examples.map((item) => `<button class="btn btn-ghost regional-example" data-example="${item.id}">${state.viewedExampleIds.includes(item.id) ? '✓ ' : ''}${esc(item.country)}<span>${esc(item.place)}</span></button>`).join('')}</div>${example ? `<h3>${model.id === 'oceania' ? `${esc(example.country)} · 지역과 대표 장소` : `${esc(example.country)} · ${esc(example.place)}`}</h3><div class="regional-photo-grid">${scenes.length ? scenes.map((scene) => `<button class="regional-photo ${state.viewedSceneIds.includes(scene.id) ? 'is-viewed' : ''}" data-scene="${scene.id}"><img src="${imageFor(model, scene.assetId)}" alt=""><strong>${esc(scene.title)}</strong></button>`).join('') : '<p>이 장소와 연결된 장면을 준비하고 있어.</p>'}</div><p class="regional-source">${model.id === 'oceania' ? `앞의 세 장면은 ${esc(area.name)} 안 서로 다른 장소의 사례이고, 대표 장소 장면은 선택한 나라와 연결돼 있어. 장면을 열면 범위 안내와 출처를 확인할 수 있어.` : `${esc(example.scope)}<br><a href="${esc(example.sourceUrl)}" target="_blank" rel="noreferrer">${esc(example.sourceTitle)}</a>`}</p>` : ''}` : `<span class="chip">위치부터 살펴보기</span><h2>${model.areaLabel}을 골라 봐</h2><p>지도 표식을 누르면 나라·장소와 자연, 오늘날의 생활, 살아 있는 문화와 대표 장소 장면이 이어져.</p><p class="regional-media-note">이 지도는 상대 위치를 익히는 학습용 그림이며 실제 축척 지도는 아니야.</p>`}
          </aside>
        </section>`;
        body.querySelectorAll<HTMLElement>('[data-area]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.area!; state.activeAreaId = id; state.activeExampleId = model.examples.find((item) => item.areaId === id)?.id ?? null; add(state.visitedAreaIds, id); persist(); render(); }));
        body.querySelector<HTMLElement>('[data-country-shortcut]')?.addEventListener('click', () => { if (!koreaShortcut) return; state.activeAreaId = koreaShortcut.areaId; state.activeExampleId = koreaShortcut.id; add(state.visitedAreaIds, koreaShortcut.areaId); add(state.viewedExampleIds, koreaShortcut.id); persist(); render(); });
        body.querySelectorAll<HTMLElement>('[data-example]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.example!; state.activeExampleId = id; add(state.viewedExampleIds, id); persist(); render(); }));
        body.querySelectorAll<HTMLElement>('[data-scene]').forEach((button) => button.addEventListener('click', () => { const scene = model.scenes.find((item) => item.id === button.dataset.scene); if (scene) openScene(scene); }));
      };

      const renderConnections = () => {
        body.innerHTML = `<section class="regional-shell"><div class="regional-connections"><div class="regional-connection-layout">
          <section class="regional-section"><span class="chip">1. 바다·물·기후의 연결</span><h2>멀리 떨어진 지역도 이어져 있어</h2><p>신호를 눌러 변화의 근거와 출처를 확인해 봐.</p><div class="regional-signal-grid">${model.signals.map((item) => `<button class="card card-pick regional-signal" data-signal="${item.id}" aria-pressed="${state.discoveredSignalIds.includes(item.id)}"><strong>${state.discoveredSignalIds.includes(item.id) ? '✓ ' : ''}${esc(item.title)}</strong><br><span>${esc(item.connection.split(' · ')[0] ?? '')}</span></button>`).join('')}</div><span class="chip">2. 지역의 목소리</span><div class="regional-choice-grid">${model.perspectives.map((item) => `<button class="card card-pick regional-choice" data-voice="${item.id}" aria-pressed="${state.listenedPerspectiveIds.includes(item.id)}"><img src="${imageFor(model, item.assetId)}" alt=""><span><strong>${esc(item.name)} · ${esc(item.role)}</strong><br>${esc(item.line)}</span></button>`).join('')}</div></section>
          <section class="regional-section"><span class="chip">3. 책임을 나누는 행동</span><h2>서로 다른 크기의 행동을 함께 골라 봐</h2><p>나·학교와 지역사회·정부와 기업·여러 나라의 행동 중 세 가지 이상을 골라.</p><div class="regional-action-grid">${model.actions.map((item) => `<button class="card card-pick regional-action" data-action="${item.id}" aria-pressed="${state.selectedActionIds.includes(item.id)}"><strong>${esc(item.label)}</strong><br><small>${esc(item.detail)}</small></button>`).join('')}</div><p class="regional-discovery">완료 조건: 환경 신호 ${model.requirements.minSignals}개, 친구 목소리 2개, 서로 다른 주체의 행동 3개.</p></section>
        </div></div></section>`;
        body.querySelectorAll<HTMLElement>('[data-signal]').forEach((button) => button.addEventListener('click', () => { const signal = model.signals.find((item) => item.id === button.dataset.signal); if (signal) openSignal(signal); }));
        body.querySelectorAll<HTMLElement>('[data-voice]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.voice!; if (state.listenedPerspectiveIds.includes(id)) state.listenedPerspectiveIds = state.listenedPerspectiveIds.filter((item) => item !== id); else { if (state.listenedPerspectiveIds.length >= 2) state.listenedPerspectiveIds.shift(); state.listenedPerspectiveIds.push(id); } persist(); render(); }));
        body.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.action!; state.selectedActionIds = state.selectedActionIds.includes(id) ? state.selectedActionIds.filter((item) => item !== id) : [...state.selectedActionIds, id].slice(-4); persist(); render(); }));
      };

      const render = () => {
        updateSteps(topBar, 2, state.screen === 'connections' ? 1 : 0, state.screen === 'connections' ? 1 : 0);
        if (state.screen === 'connections') renderConnections(); else renderExplore();
        renderDock();
      };
      render();
    },
    unmount() {
      disposed = true;
      closeModal?.();
      closeModal = null;
    }
  };
}

export function createAsiaPage(): Page {
  return createRegionalPage(async () => asiaModel(await loadContent<AsiaSource>('asia')));
}

export function createOceaniaPage(): Page {
  return createRegionalPage(async () => oceaniaModel(await loadContent<OceaniaSource>('oceania')));
}
