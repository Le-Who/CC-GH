/** Renderer-neutral presentation. No cache allocation, global registry update,
 * admission, prop commit, release-clock mutation, or production enablement.
 * A pending or stale frame is explicitly invalidated, never held past release. */
import {clone, freeze, digest, requireThat as check, finite, near, same} from './util.mjs';
import {CAMERA_SHA256, PREVIEW_PLAN_VERSION} from './source-sampler.mjs';

export const MANIFEST_FORMAT = 'mochi-C4S1E1-candidate-media/v1';
const hash = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const point2 = p => Array.isArray(p) && p.length === 2 && p.every(finite);
const planRef = (sampler, manifest) => ({...clone(sampler.identity), manifestRevision: manifest.revision,
  manifestDigest: digest(manifest)});
const frameKey = (ref, logicalKey, imageId) => `${digest(ref)}:${logicalKey}:${imageId}`;

export function validateManifest({sampler, manifest: input, allowFixture = false,
  allowPartialPreview = false, assetVerification = null} = {}) {
  const manifest = clone(input);
  check(manifest?.format === MANIFEST_FORMAT && manifest.runtimeActivated === false
    && typeof manifest.revision === 'string' && manifest.revision.length > 0, 'CANDIDATE_MANIFEST_REQUIRED');
  check(same(manifest.identity, sampler.identity), 'MANIFEST_SOURCE_MAPPING_IDENTITY_MISMATCH');
  check(['fixture', 'actual-raster'].includes(manifest.mediaKind), 'EXPLICIT_MEDIA_KIND_REQUIRED');
  const fixture = manifest.mediaKind === 'fixture';
  check(!fixture || allowFixture, 'FIXTURE_IS_NOT_ACTUAL_MEDIA');
  const camera = manifest.camera;
  check(camera?.sourceCameraSha256 === CAMERA_SHA256 && point2(camera.canvas)
    && camera.canvas.every(n => Number.isSafeInteger(n) && n > 0)
    && camera.pixelsPerSourceWorld === sampler.camera.ppu && point2(camera.pivotPx)
    && point2(camera.sourceOriginOffsetPx) && camera.runtimeSpriteRotationAllowed === false
    && camera.pivotPx.every((n, i) => near(n, sampler.camera.pivotPx[i] + camera.sourceOriginOffsetPx[i])),
    'CALIBRATED_CAMERA_ORIGIN_REQUIRED');
  if (!fixture) {
    check(assetVerification?.format === 'mochi-C4S1E1-asset-verification/v1'
      && assetVerification.manifestDigest === digest(manifest)
      && assetVerification.sourceSha256 === sampler.identity.sourceSha256
      && assetVerification.allListedFilesVerified === true
      && assetVerification.decodedDimensionsVerified === true,
      'ACTUAL_MANIFEST_ASSET_VERIFICATION_REQUIRED');
  }
  check(Array.isArray(manifest.frames) && manifest.frames.length === sampler.mapping.length,
    'ALL_LOGICAL_SLOTS_MUST_BE_ENUMERATED');
  const frameMap = new Map(), images = manifest.images, pages = manifest.pages;
  check(images && pages && typeof images === 'object' && typeof pages === 'object', 'IMAGE_PAGE_MAPS_REQUIRED');
  if (manifest.hardDecodedPageCapBytes != null) {
    check(Number.isSafeInteger(manifest.hardDecodedPageCapBytes) && manifest.hardDecodedPageCapBytes > 0
      && manifest.hardDecodedPageCapBytes <= 1572864
      && Object.values(pages).every(p => p.width * p.height * 4 <= manifest.hardDecodedPageCapBytes),
      'BOUNDED_TEMPORAL_PAGE_CAP_EXCEEDED');
  }
  for (let i = 0; i < manifest.frames.length; i++) {
    const f = manifest.frames[i], expected = sampler.mapping[i];
    for (const key of Object.keys(expected)) check(same(f[key], expected[key]), `FRAME_SOURCE_MAPPING_MISMATCH:${expected.logicalKey}:${key}`);
    check(!frameMap.has(f.logicalKey), 'DUPLICATE_LOGICAL_SLOT');
    check(f.imageId === null || (typeof f.imageId === 'string' && Object.hasOwn(images, f.imageId)), 'FRAME_IMAGE_UNAVAILABLE');
    frameMap.set(f.logicalKey, f);
  }
  const complete = manifest.frames.every(f => f.imageId !== null);
  check(manifest.complete == null || manifest.complete === complete, 'MANIFEST_COVERAGE_CLAIM_MISMATCH');
  check(complete || (allowPartialPreview && manifest.partialPreview === true), 'COMPLETE_ACTUAL_COVERAGE_REQUIRED');
  for (const [id, image] of Object.entries(images)) {
    const page = pages[image.pageId], rect = image.rect;
    check(page && typeof page.src === 'string' && page.src.length > 0 && hash(page.sha256)
      && Number.isSafeInteger(page.width) && page.width > 0
      && Number.isSafeInteger(page.height) && page.height > 0, `PAGE_METADATA_INVALID:${id}`);
    check(rect && [rect.x, rect.y, rect.width, rect.height].every(integer)
      && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= page.width && rect.y + rect.height <= page.height,
      `ATLAS_RECT_INVALID:${id}`);
    check(image.trim && [image.trim.x, image.trim.y].every(integer)
      && same(image.canvas, camera.canvas) && same(image.pivotPx, camera.pivotPx)
      && image.trim.x + rect.width <= image.canvas[0] && image.trim.y + rect.height <= image.canvas[1],
      `CROP_ORIGIN_INVALID:${id}`);
    if (image.runtimeCellEvidence) {
      const e = image.runtimeCellEvidence;
      check(e.safeEdgePx === 10 && e.atlasGutterPx === 2
        && hash(e.nativeRgbaSha256) && hash(e.croppedRgbaSha256)
        && e.reembeddedRgbaSha256 === e.nativeRgbaSha256
        && e.safeEdgeRgbaZero === true && e.discardedRgbaZero === true
        && same(e.alphaBounds, [image.trim.x + e.safeEdgePx, image.trim.y + e.safeEdgePx,
          image.trim.x + rect.width - e.safeEdgePx, image.trim.y + rect.height - e.safeEdgePx])
        && rect.x >= e.atlasGutterPx && rect.y >= e.atlasGutterPx
        && rect.x + rect.width + e.atlasGutterPx <= page.width
        && rect.y + rect.height + e.atlasGutterPx <= page.height,
        'PACKED_RUNTIME_CELL_EVIDENCE_MISMATCH');
    }
    const owners = manifest.frames.filter(f => f.imageId === id);
    check(owners.length > 0 && owners.every(f => f.rootTreatment === image.rootTreatment), 'IMAGE_ROOT_TREATMENT_MISMATCH');
    const nativeKeys = [...new Set(owners.map(f => f.nativeKey))].sort();
    if (!fixture) {
      const source = image.sourceRequest;
      check(source && owners.some(f => f.action === source.action && f.sourceFrameIndex === source.sourceFrameIndex
        && f.sourceAtMs === source.sourceAtMs), 'IMAGE_CANONICAL_SOURCE_REQUEST_MISMATCH');
    }
    // Repeated SAME native action/time request is an ordinary mapping reuse.
    // Distinct requests need their own final-profile decoded-pixel evidence.
    if (nativeKeys.length > 1) {
      const proof = manifest.pixelAliasProofs?.find(p => p.imageId === id);
      check(!fixture && proof?.decodedRGBAEqual === true && proof.differentPixels === 0
        && hash(proof.decodedPixelSha256) && hash(proof.productionProfileSha256)
        && hash(manifest.recipeSha256) && proof.productionProfileSha256 === manifest.recipeSha256
        && proof.sourceSha256 === sampler.identity.sourceSha256
        && proof.mappingRevision === sampler.identity.mappingRevision
        && same([...proof.nativeKeys].sort(), nativeKeys), 'UNQUALIFIED_PIXEL_ALIAS');
    }
  }
  if (!fixture) {
    check(Object.entries(pages).every(([id, p]) => assetVerification.pages?.[id]?.sha256 === p.sha256
      && assetVerification.pages[id].width === p.width && assetVerification.pages[id].height === p.height),
      'VERIFIED_PAGE_SET_MISMATCH');
  }
  return freeze({manifest, reference: planRef(sampler, manifest), complete,
    fixtureOnly: fixture, frameMap: Object.fromEntries(frameMap), runtimeActivated: false,
    productionReady: false});
}

export function createMochiC4S1E1Presenter(options = {}) {
  const {sampler} = options, validated = validateManifest(options);
  const {manifest, reference, frameMap} = validated;
  function bindPreviewPlan(plan) {
    check(plan?.format === PREVIEW_PLAN_VERSION && same(plan.identity, sampler.identity)
      && plan.runtimeActivated === false, 'CANDIDATE_PREVIEW_PLAN_REQUIRED');
    check(!plan.mediaReference || same(plan.mediaReference, reference), 'EXISTING_PLAN_MEDIA_IDENTITY_IMMUTABLE');
    return freeze({...clone(plan), mediaReference: clone(reference)});
  }
  function selectPose(pose, at) {
    if (!pose) return {at, pose: null, request: null};
    const frame = frameMap[pose.frame.logicalKey];
    if (!frame || frame.imageId === null) return {at, pose: null, request: null,
      desiredPose: pose, issue: 'SOURCE_FRAME_NOT_RENDERED'};
    const image = manifest.images[frame.imageId], page = manifest.pages[image.pageId];
    const pivotPx = [image.pivotPx[0] - image.trim.x, image.pivotPx[1] - image.trim.y];
    const request = freeze({key: frameKey(reference, frame.logicalKey, frame.imageId),
      mediaReference: clone(reference), logicalKey: frame.logicalKey, imageId: frame.imageId,
      descriptorId: frame.descriptorId, logicalIndex: frame.logicalIndex,
      pageId: image.pageId, page: clone(page), rect: clone(image.rect), pivotPx,
      untrimmedPivotPx: clone(image.pivotPx), trim: clone(image.trim),
      canvas: clone(image.canvas), rootTreatment: image.rootTreatment,
      ...(image.runtimeCellEvidence ? {runtimeCellEvidence: clone(image.runtimeCellEvidence)} : {}),
      pixelsPerSourceWorld: manifest.camera.pixelsPerSourceWorld});
    return {at, pose, request};
  }
  function select(plan, at) {
    check(same(plan?.mediaReference, reference), 'PLAN_MEDIA_IDENTITY_MISMATCH');
    return selectPose(sampler.sample(plan, at), at);
  }
  function inspectSourceFrame(descriptorId, sourceMs, placement) {
    return {...selectPose(sampler.samplePlacedDescriptor(descriptorId, sourceMs, placement), sourceMs),
      inspectionOnly: true};
  }
  function requests(plan, at, lookaheadMs = 0) {
    check(finite(lookaheadMs) && lookaheadMs >= 0, 'FINITE_LOOKAHEAD_REQUIRED');
    const current = select(plan, at), future = select(plan, at + lookaheadMs);
    return {current, required: current.request ? [current.request] : [],
      lookahead: future.request ? [future.request] : []};
  }
  function pageRequests(plan, at, {horizonMs = sampler.contract.combined.rest.periodMs, maxFuturePages = 1} = {}) {
    check(finite(horizonMs) && horizonMs >= 0 && Number.isSafeInteger(maxFuturePages) && maxFuturePages >= 0,
      'BOUNDED_PAGE_LOOKAHEAD_REQUIRED');
    const current = select(plan, at), required = current.request ? [current.request] : [];
    const seen = new Set(required.map(r => r.pageId)), lookahead = [];
    const sampleMs = sampler.source.sourceSampleMs;
    const firstBoundary = plan.startAt + (Math.floor((at - plan.startAt) / sampleMs) + 1) * sampleMs;
    let samples = 0;
    for (let nextAt = Math.max(firstBoundary, plan.startAt); nextAt < plan.endAt && nextAt <= at + horizonMs
      && lookahead.length < maxFuturePages; nextAt += sampleMs) {
      const selected = select(plan, nextAt); samples++;
      if (!selected.request || seen.has(selected.request.pageId)) continue;
      seen.add(selected.request.pageId); lookahead.push({...selected.request, neededAt: nextAt});
    }
    return {current, required, lookahead, samples};
  }
  function compose(plan, at, props, cache) {
    check(Array.isArray(props) && typeof cache?.getFrame === 'function', 'PROPS_AND_SCENE_OWNED_CACHE_REQUIRED');
    const selection = select(plan, at);
    const desiredPose = selection.pose || selection.desiredPose;
    const target = props.filter(p => p.slotId === plan.placement.slotId);
    const current = target[0]?.transform || target[0];
    const unchanged = target.length === 1 && target[0].goodieId === plan.placement.goodieId
      && target[0].condition === plan.placement.condition
      && near(current.x, plan.placement.x) && near(current.y, plan.placement.y)
      && near(current.rotationZ ?? 0, plan.placement.rotationZ ?? 0);
    const ready = selection.request ? cache.getFrame(selection.request) : null;
    const coherent = ready?.ready === true && ready.texture != null && ready.key === selection.request?.key
      && ready.imageId === selection.request?.imageId && same(ready.mediaReference, reference);
    const ownsProp = !!selection.pose?.containsTargetProp && coherent && unchanged
      && at < plan.previewPropReleaseAt;
    const canDraw = coherent && (!selection.pose?.containsTargetProp || ownsProp);
    const issue = selection.issue || (desiredPose?.containsTargetProp && !unchanged ? 'TARGET_PROP_CHANGED'
      : desiredPose && !coherent ? 'SOURCE_FRAME_PENDING_OR_STALE' : null);
    // Explicitly reset this slot every draw. Never carry old drawStandalone=false
    // into release, reload, an absent frame, or an unrelated new media revision.
    const nextProps = props.map(p => p.slotId === plan.placement.slotId
      ? {...clone(p), drawStandalone: !ownsProp,
        visualOwner: ownsProp ? selection.request.key : null} : clone(p));
    return {...selection, pose: canDraw ? selection.pose : null,
      texture: canDraw ? ready.texture : null, props: nextProps,
      targetSlotHidden: ownsProp ? plan.placement.slotId : null,
      issue, invalidatePreviousActor: !canDraw,
      requiresCoherentFrameHold: false, fixtureOnly: validated.fixtureOnly,
      productionReady: false, runtimeActivated: false};
  }
  return freeze({reference, manifest, complete: validated.complete, fixtureOnly: validated.fixtureOnly,
    bindPreviewPlan, select, inspectSourceFrame, requests, pageRequests, compose, runtimeActivated: false, admissionReady: false});
}

/** Exact-version dispatch. Entries are caller-verified historical/current
 * adapters. Unknown or mismatched records fail closed; never upgrade by actor ID. */
export function createVersionedPresentationDispatcher(entries) {
  check(Array.isArray(entries), 'EXPLICIT_VERSIONED_ADAPTERS_REQUIRED');
  const adapters = new Map();
  for (const {reference, sample} of entries) {
    check(reference && typeof sample === 'function', 'VERSIONED_SAMPLER_REQUIRED');
    const key = digest(reference);
    check(!adapters.has(key), 'DUPLICATE_PRESENTATION_IDENTITY');
    adapters.set(key, {reference: freeze(clone(reference)), sample});
  }
  return Object.freeze({sample(plan, at) {
    const reference = plan?.mediaReference;
    if (!reference) return {pose: null, issue: 'PERSISTED_MEDIA_IDENTITY_REQUIRED'};
    const adapter = adapters.get(digest(reference));
    if (!adapter || !same(reference, adapter.reference)) return {pose: null, issue: 'HISTORICAL_MEDIA_UNAVAILABLE'};
    return adapter.sample(plan, at);
  }});
}

/** Read historical R5 saved records without adding fields or rewriting them.
 * The caller provides exact archived admission identities and their old media
 * sampler. Missing archive is an unavailable presentation, not an upgrade. */
export function createR5SavedRecordDispatcher(archives) {
  check(Array.isArray(archives), 'EXPLICIT_HISTORICAL_ARCHIVES_REQUIRED');
  const keys = new Map();
  const referenceOf = record => {
    const media = record?.mediaAdmission, plan = media?.plan;
    if (!media || !plan) return null;
    const fields = {bindingId: media.bindingId, bindingRevision: media.bindingRevision,
      bindingCalibrationHash: media.bindingCalibrationHash,
      registryRevision: media.registryRevision, registryHash: media.registryHash,
      actorProfile: plan.actorProfile, groundFootprintRevision: plan.groundFootprintRevision,
      clipId: plan.clipId, calibrationHash: plan.calibrationHash, scheduleVersion: plan.schedule?.version};
    return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  };
  for (const archive of archives) {
    check(archive.reference && typeof archive.sample === 'function'
      && typeof archive.reference.bindingId === 'string' && typeof archive.reference.bindingRevision === 'string'
      && archive.reference.actorProfile && typeof archive.reference.scheduleVersion === 'string'
      && (typeof archive.reference.bindingCalibrationHash === 'string'
        || typeof archive.reference.registryHash === 'string'), 'EXACT_ARCHIVED_R5_IDENTITY_REQUIRED');
    const key = digest(archive.reference);
    check(!keys.has(key), 'DUPLICATE_R5_ARCHIVE');
    keys.set(key, {reference: freeze(clone(archive.reference)), sample: archive.sample});
  }
  return Object.freeze({referenceOf, sample(record, at) {
    const ref = referenceOf(record), entry = ref && keys.get(digest(ref));
    if (!entry || !same(entry.reference, ref)) return {pose: null, issue: 'HISTORICAL_MEDIA_UNAVAILABLE'};
    return entry.sample(record, at);
  }});
}
