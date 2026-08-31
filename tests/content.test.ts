import { describe, expect, it } from 'vitest';
import { validateContentDocument, validateContentEnvelope } from '../src/core/ContentRepository';
import common from '../public/content/v1/ko/common.json';
import asia from '../public/content/v1/ko/asia.json';
import europe from '../public/content/v1/ko/europe.json';
import africa from '../public/content/v1/ko/africa.json';
import americas from '../public/content/v1/ko/americas.json';
import oceania from '../public/content/v1/ko/oceania.json';
import dialogue from '../public/content/v1/ko/dialogue.json';
import environment from '../public/content/v1/ko/environment.json';
import assetManifest from '../src/content/asset-manifest.json';

const actualFiles = { common, asia, europe, africa, americas, oceania, dialogue, environment };

describe('콘텐츠 공통 스키마', () => {
  it('v1 콘텐츠의 공통 필드를 확인한다', () => {
    expect(validateContentEnvelope({
      schemaVersion: 1,
      missionId: 'sample',
      needsReview: true,
      rounds: []
    }).missionId).toBe('sample');
  });

  it('객체가 아니거나 필수 필드가 잘못되면 거부한다', () => {
    expect(() => validateContentEnvelope(null)).toThrow();
    expect(validateContentEnvelope({ schemaVersion: 2, missionId: 'sample', needsReview: true }).schemaVersion).toBe(2);
    expect(() => validateContentEnvelope({ schemaVersion: 3, missionId: 'sample', needsReview: true })).toThrow();
    expect(() => validateContentEnvelope({ schemaVersion: 1, missionId: '', needsReview: true })).toThrow();
    expect(() => validateContentEnvelope({ schemaVersion: 1, missionId: 'sample' })).toThrow();
  });

  it('배포되는 콘텐츠 8종이 공통 스키마와 검토 표시를 갖는다', () => {
    for (const [name, content] of Object.entries(actualFiles)) {
      const validated = validateContentDocument(content, name);
      expect(validated.needsReview, `${name}.needsReview`).toBe(true);
      expect(Array.isArray(validated.standards), `${name}.standards`).toBe(true);
      expect(Array.isArray(validated.learningObjectives), `${name}.learningObjectives`).toBe(true);
      expect((validated.learningObjectives as unknown[]).length, `${name}.learningObjectives`).toBeGreaterThan(0);
    }
  });

  it('파일별 필수 필드 누락과 HTML 삽입을 거부한다', () => {
    expect(() => validateContentDocument({ schemaVersion: 1, missionId: 'common', needsReview: true }, 'common')).toThrow(/객체|배열/);
    expect(() => validateContentDocument({
      schemaVersion: 1,
      missionId: 'common',
      needsReview: true,
      standards: [],
      learningObjectives: ['학습목표'],
      ui: { title: '<img src=x onerror=alert(1)>' },
      nickname: {},
      reflectionFrame: '회고 문장',
      actionPrinciples: [],
      stamps: []
    }, 'common')).toThrow(/HTML/);
  });

  it('속성 주입용 식별자와 위험한 객체 키를 거부한다', () => {
    const badId = structuredClone(asia);
    badId.scenes[0]!.id = 'x" onpointerover="alert(1)';
    expect(() => validateContentDocument(badId, 'asia')).toThrow(/식별자/);

    const badKey = structuredClone(oceania) as unknown as Record<string, unknown>;
    const actionTiers = badKey.actionTiers as Array<Record<string, unknown>>;
    actionTiers[0]!['x" onpointerover="alert(1)'] = ['선택'];
    expect(() => validateContentDocument(badKey, 'oceania')).toThrow(/필드 이름/);
  });

  it('europe는 7개 나라에 환경·생활·문화 장면을 각각 제공한다', () => {
    expect(europe.countries).toHaveLength(7);
    const expected = new Set(['france', 'germany', 'italy', 'spain', 'poland', 'greece', 'czechia']);
    const visualIds = new Set<string>();
    for (const country of europe.countries) {
      expect(expected.has(country.id), country.id).toBe(true);
      expect(country.visuals).toHaveLength(3);
      expect(new Set(country.visuals.map((visual) => visual.category))).toEqual(new Set(['environment', 'daily', 'heritage']));
      for (const visual of country.visuals) {
        expect(visualIds.has(visual.id), `중복 시각 자료 ID: ${visual.id}`).toBe(false);
        visualIds.add(visual.id);
        expect(visual.imageId.length).toBeGreaterThan(0);
        expect(visual.sourceTitle.length).toBeGreaterThan(0);
        expect(visual.sourceUrl.length).toBeGreaterThan(0);
        expect(typeof visual.needsReview).toBe('boolean');
      }
    }
    expect(europe.requirements).toEqual({
      minCountries: 7,
      minVisualsPerVisitedCountry: 3,
      minSavedVisuals: 7,
      minSavedCountries: 7
    });
  });

  it('oceania는 여러 지역·사례·환경 신호·관점을 하나의 바다 흐름으로 제공한다', () => {
    expect(oceania.zones.length).toBeGreaterThanOrEqual(5);
    expect(oceania.countryExamples.length).toBeGreaterThanOrEqual(8);
    expect(oceania.scenes.length).toBeGreaterThanOrEqual(10);
    expect(oceania.signals.length).toBeGreaterThanOrEqual(3);
    expect(oceania.perspectives.length).toBeGreaterThanOrEqual(4);
    for (const zone of oceania.zones) {
      expect(oceania.countryExamples.some((example) => example.zoneId === zone.id), zone.id).toBe(true);
      const zoneScenes = oceania.scenes.filter((scene) => scene.zoneId === zone.id);
      const coreScenes = zoneScenes.filter((scene) => scene.category !== 'landmark');
      expect(coreScenes, `${zone.id}.coreScenes`).toHaveLength(3);
      expect(new Set(coreScenes.map((scene) => scene.category)), `${zone.id}.categories`).toEqual(new Set(['nature', 'daily', 'culture']));
    }
    const oceaniaCountries = new Set(oceania.countryExamples.map((example) => example.country));
    expect(oceania.scenes.filter((scene) => scene.category === 'landmark')).toHaveLength(oceaniaCountries.size);
    for (const scene of oceania.scenes) {
      expect(scene.hotspots.length, `${scene.id}.hotspots`).toBeGreaterThanOrEqual(2);
      expect(scene.discovery.trim().length, `${scene.id}.discovery`).toBeGreaterThan(12);
    }
    for (const signal of oceania.signals) {
      expect(signal.zoneIds.length, `${signal.id}.zoneIds`).toBeGreaterThanOrEqual(2);
      expect(signal.sourceUrl.startsWith('https://'), `${signal.id}.sourceUrl`).toBe(true);
    }
  });

  it('africa는 다섯 권역·열 나라와 소리에서 공동 해결로 이어지는 흐름을 제공한다', () => {
    expect(africa.regions).toHaveLength(5);
    expect(new Set(africa.regions.map((region) => region.interaction)).size).toBe(5);
    expect(africa.countryCases.length).toBeGreaterThanOrEqual(10);
    expect(africa.landmarks).toHaveLength(africa.countryCases.length);
    expect(new Set(africa.landmarks.map((item) => item.countryCaseId)).size).toBe(africa.countryCases.length);
    for (const region of africa.regions) {
      expect(africa.countryCases.filter((item) => item.regionId === region.id).length, region.id).toBeGreaterThanOrEqual(2);
      expect(region.sceneAssetId, `${region.id}.sceneAssetId`).toBe(`africa.region.${region.id}`);
      expect(region.sceneStops, `${region.id}.sceneStops`).toHaveLength(3);
      expect(new Set(region.sceneStops.map((stop) => stop.id)).size, `${region.id}.sceneStopIds`).toBe(3);
      expect(region.sceneStops.every((stop) => stop.note.length >= 20), `${region.id}.sceneStopNotes`).toBe(true);
    }
    expect(africa.environmentSignals.length).toBeGreaterThanOrEqual(3);
    expect(africa.actionTiers.length).toBeGreaterThanOrEqual(3);
    expect(africa.actions.length).toBeGreaterThanOrEqual(6);
    expect(africa.sources.every((source) => source.url.startsWith('https://'))).toBe(true);
  });

  it('미션에서 즉시 사용하는 중첩 배열의 손상을 거부한다', () => {
    const broken = structuredClone(asia) as unknown as Record<string, unknown>;
    broken.scenes = null;
    expect(() => validateContentDocument(broken, 'asia')).toThrow(/배열/);
  });

  it('아시아는 5개 권역과 6개 이상의 실제 사례, 장면·출처 메타데이터를 제공한다', () => {
    expect(asia.regions.map((region) => region.id)).toEqual(['east', 'southeast', 'south', 'central', 'west']);
    expect(asia.countryExamples.length).toBeGreaterThanOrEqual(6);
    for (const example of asia.countryExamples) {
      expect(example.sceneIds).toHaveLength(4);
      expect(asia.scenes.find((scene) => scene.id === example.sceneIds.at(-1))?.category).toBe('landmark');
      expect(example.scopeNoteKo.length).toBeGreaterThan(20);
      expect(example.sourceUrl.startsWith('https://')).toBe(true);
      expect(typeof example.needsReview).toBe('boolean');
    }
    expect(asia.countryExamples.find((example) => example.countryNameKo === '대한민국')?.sceneIds).toHaveLength(4);
    expect(asia.requirements).toEqual({ minRegions: 4, minExamples: 6, minDiscoveries: 4, minSignals: 3 });
  });

  it('아시아·오세아니아 지도와 모든 관찰 장면이 실제 이미지 자산에 연결된다', () => {
    expect(assetManifest.assets['asia.map.regional']?.src).toContain('asia_map_regional_v2');
    expect(assetManifest.assets['oceania.map.regional']?.src).toContain('oceania_map_regional_v2');
    for (const scene of asia.scenes) {
      expect(scene.imageAssetId in assetManifest.assets, `asia:${scene.id}:${scene.imageAssetId}`).toBe(true);
    }
    for (const scene of oceania.scenes) {
      expect(scene.assetId in assetManifest.assets, `oceania:${scene.id}:${scene.assetId}`).toBe(true);
    }
    expect(oceania.scenes.find((scene) => scene.id === 'fiji_nature')?.assetId).toBe('oceania.melanesia.nature');
  });

  it('아메리카 지도와 네 나라의 모든 탐험 지점이 독립 이미지 자산에 연결된다', () => {
    expect(assetManifest.assets['americas.map']?.src).toContain('americas_map_regional_v2');
    for (const country of americas.explore.countries) {
      expect(country.stops).toHaveLength(4);
      expect(country.stops.at(-1)?.id).toBe('landmark');
      for (const stop of country.stops) {
        const assetId = `americas.scene.${country.id}.${stop.id}`;
        expect(assetId in assetManifest.assets, assetId).toBe(true);
      }
    }
  });

  it('국가·문화 콘텐츠는 검증일, 공식 출처, 가상 인물·재현 이미지 고지를 함께 제공한다', () => {
    const verifiedDocuments = [americas, asia, europe, africa, oceania, dialogue, environment];
    for (const content of verifiedDocuments) {
      expect(content.factCheck.verifiedAt).toBe('2026-08-31');
      expect(content.factCheck.status).toContain('대조 완료');
      expect(content.factCheck.peopleNote.length).toBeGreaterThan(25);
      expect(content.factCheck.mediaNote).toContain('학습용');
      expect(content.factCheck.sources.length).toBeGreaterThanOrEqual(4);
      expect(content.factCheck.sources.every((source) => source.url.startsWith('https://'))).toBe(true);
    }
    expect(JSON.stringify(americas)).not.toContain('halal_meal');
    expect(JSON.stringify(americas)).toContain('pork_free_option');
    expect(asia.scenes.find((scene) => scene.id === 'china_nature')?.titleKo).toBe('대운하와 큰 도시');
    expect(dialogue.greetings.find((greeting) => greeting.id === 'greet_japan')?.introduction).toContain('오키나와');
    expect(africa.countryCases.find((item) => item.id === 'south-africa-cape')?.culturalExample).toContain('12개 공용어');
  });

  it('학습용 지도 표시는 실제 대륙의 동서·남북 상대 관계를 뒤바꾸지 않는다', () => {
    const europeMap = Object.fromEntries(europe.countries.map((country) => [country.id, country.map]));
    expect(europeMap.spain!.x).toBeLessThan(europeMap.france!.x);
    expect(europeMap.spain!.y).toBeGreaterThan(europeMap.france!.y);
    expect(europeMap.poland!.x).toBeGreaterThan(europeMap.germany!.x);
    expect(europeMap.czechia!.x).toBeGreaterThan(europeMap.germany!.x);
    expect(europeMap.czechia!.x).toBeLessThan(europeMap.poland!.x);
    expect(europeMap.italy!.y).toBeGreaterThan(europeMap.germany!.y);
    expect(europeMap.greece!.x).toBeGreaterThan(europeMap.italy!.x);

    const asiaMap = Object.fromEntries(asia.regions.map((region) => [region.id, region.mapPosition]));
    expect(asiaMap.west!.xPercent).toBeLessThan(asiaMap.central!.xPercent);
    expect(asiaMap.central!.xPercent).toBeLessThan(asiaMap.east!.xPercent);
    expect(asiaMap.south!.yPercent).toBeGreaterThan(asiaMap.east!.yPercent);
    expect(asiaMap.southeast!.xPercent).toBeGreaterThan(asiaMap.south!.xPercent);
    expect(asiaMap.southeast!.yPercent).toBeGreaterThan(asiaMap.east!.yPercent);

    const africaMap = Object.fromEntries(africa.regions.map((region) => [region.id, region.position]));
    expect(africaMap.north!.y).toBeLessThan(africaMap.central!.y);
    expect(africaMap.central!.y).toBeLessThan(africaMap.south!.y);
    expect(africaMap.west!.x).toBeLessThan(africaMap.central!.x);
    expect(africaMap.central!.x).toBeLessThan(africaMap.east!.x);
    for (const item of africa.countryCases) {
      expect(item.mapPosition.x, `${item.id}.x`).toBeGreaterThanOrEqual(0);
      expect(item.mapPosition.x, `${item.id}.x`).toBeLessThanOrEqual(100);
      expect(item.mapPosition.y, `${item.id}.y`).toBeGreaterThanOrEqual(0);
      expect(item.mapPosition.y, `${item.id}.y`).toBeLessThanOrEqual(100);
    }
    expect(africa.countryCases.find((item) => item.countryId === 'morocco')!.mapPosition.y)
      .toBeLessThan(africa.countryCases.find((item) => item.countryId === 'ghana')!.mapPosition.y);
    expect(africa.countryCases.find((item) => item.countryId === 'south-africa')!.mapPosition.y)
      .toBeGreaterThan(africa.countryCases.find((item) => item.countryId === 'namibia')!.mapPosition.y);

    // 아메리카 지도는 16:9 이미지 위의 % 좌표다. 나라·렌즈 지점이 실제 남북·동서 관계를 지켜야 한다.
    const americasMap = Object.fromEntries(americas.explore.countries.map((c) => [c.id, c.position]));
    expect(americasMap.canada!.y).toBeLessThan(americasMap.mexico!.y);
    expect(americasMap.mexico!.y).toBeLessThan(americasMap.brazil!.y);
    expect(americasMap.peru!.x).toBeLessThan(americasMap.brazil!.x);
    expect(americasMap.peru!.y).toBeGreaterThan(americasMap.mexico!.y);
    const americasPoints = Object.fromEntries(
      americas.explore.lenses.flatMap((lens) => lens.points.map((point) => [point.id, point]))
    );
    // 적도는 남아메리카 북부를 지난다 — 브라질보다 위, 멕시코보다 아래
    expect(americasPoints.equator!.y).toBeLessThan(americasMap.brazil!.y);
    expect(americasPoints.equator!.y).toBeGreaterThan(americasMap.mexico!.y);
    for (const point of Object.values(americasPoints)) {
      expect(point.x, `${point.id}.x`).toBeGreaterThan(0);
      expect(point.x, `${point.id}.x`).toBeLessThan(100);
      expect(point.y, `${point.id}.y`).toBeGreaterThan(0);
      expect(point.y, `${point.id}.y`).toBeLessThan(100);
    }

    const oceaniaMap = Object.fromEntries(oceania.zones.map((zone) => [zone.id, { x: zone.x, y: zone.y }]));
    expect(oceaniaMap.australia!.x).toBeLessThan(oceaniaMap.new_zealand!.x);
    expect(oceaniaMap.new_zealand!.y).toBeGreaterThan(oceaniaMap.australia!.y);
    expect(oceaniaMap.micronesia!.y).toBeLessThan(oceaniaMap.melanesia!.y);
    expect(oceaniaMap.polynesia!.x).toBeGreaterThan(oceaniaMap.melanesia!.x);
  });
});
