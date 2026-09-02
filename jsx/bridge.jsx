/* global app, qe, JSON, File, Folder, Time, XML */
var PMB = PMB || {};

PMB.TICKS_PER_SECOND = 254016000000;
PMB.events = [];

PMB.log = function (eventName, detail) {
  var entry = { event: eventName };
  if (detail !== undefined && detail !== null) entry.detail = String(detail);
  PMB.events.push(entry);
  try { app.setSDKEventMessage(eventName + (entry.detail ? " " + entry.detail : ""), "info"); } catch (ignore) {}
};

PMB.fail = function (code, message) {
  PMB.log(code, message || "");
  return { ok: false, error: code, message: message || code, events: PMB.events };
};

PMB.ticks = function (timeValue) {
  if (!timeValue) return 0;
  try { return Number(timeValue.ticks); } catch (ignore) {}
  return 0;
};

PMB.activeSequence = function () {
  var seq = app.project && app.project.activeSequence;
  if (!seq) return null;
  PMB.log("ACTIVE_SEQUENCE_FOUND", seq.name);
  return seq;
};

PMB.findClipCoordinates = function (seq, candidate) {
  var trackIndex, clipIndex, clip;
  for (trackIndex = 0; trackIndex < seq.videoTracks.numTracks; trackIndex++) {
    var track = seq.videoTracks[trackIndex];
    for (clipIndex = 0; clipIndex < track.clips.numItems; clipIndex++) {
      clip = track.clips[clipIndex];
      try {
        if (candidate.nodeId && clip.nodeId === candidate.nodeId) {
          return { clip: clip, trackIndex: trackIndex, clipIndex: clipIndex };
        }
      } catch (ignoreNode) {}
      try {
        if (String(clip.start.ticks) === String(candidate.start.ticks) &&
            String(clip.end.ticks) === String(candidate.end.ticks) &&
            clip.name === candidate.name) {
          return { clip: clip, trackIndex: trackIndex, clipIndex: clipIndex };
        }
      } catch (ignoreShape) {}
    }
  }
  return null;
};

PMB.findSelectedVideoClip = function (seq) {
  var selection, i, located;
  try { selection = seq.getSelection(); } catch (ignore) { selection = []; }
  for (i = 0; i < selection.length; i++) {
    try {
      if (selection[i].mediaType === "Video" || selection[i].type === 1) {
        located = PMB.findClipCoordinates(seq, selection[i]);
        if (located) {
          PMB.log("SELECTED_CLIP_FOUND", located.clip.name);
          return located;
        }
      }
    } catch (ignoreCandidate) {}
  }

  var playhead = PMB.ticks(seq.getPlayerPosition());
  for (var trackIndex = seq.videoTracks.numTracks - 1; trackIndex >= 0; trackIndex--) {
    var track = seq.videoTracks[trackIndex];
    for (var clipIndex = 0; clipIndex < track.clips.numItems; clipIndex++) {
      var clip = track.clips[clipIndex];
      if (PMB.ticks(clip.start) <= playhead && playhead < PMB.ticks(clip.end)) {
        PMB.log("SELECTED_CLIP_FOUND", clip.name + " (fallback under playhead)");
        return { clip: clip, trackIndex: trackIndex, clipIndex: clipIndex, fallback: true };
      }
    }
  }
  return null;
};

PMB.findQEClip = function (qeTrack, startTicks, clipName) {
  for (var i = 0; i < qeTrack.numItems; i++) {
    var item = qeTrack.getItemAt(i);
    if (!item || item.type === "Empty") continue;
    try {
      if (String(item.start.ticks) === String(startTicks) && (!clipName || item.name === clipName)) return item;
    } catch (ignore) {}
  }
  for (var j = 0; j < qeTrack.numItems; j++) {
    var fallback = qeTrack.getItemAt(j);
    if (!fallback || fallback.type === "Empty") continue;
    try { if (String(fallback.start.ticks) === String(startTicks)) return fallback; } catch (ignoreFallback) {}
  }
  return null;
};

PMB.componentSnapshot = function (clip) {
  var out = [];
  for (var i = 0; i < clip.components.numItems; i++) {
    var component = clip.components[i];
    var info = { name: String(component.displayName || component.matchName || "component"), matchName: String(component.matchName || ""), properties: [] };
    for (var j = 0; j < component.properties.numItems; j++) {
      var property = component.properties[j];
      var propertyInfo = { name: String(property.displayName || "property") };
      try { propertyInfo.timeVarying = !!property.isTimeVarying(); } catch (ignoreTV) {}
      try {
        var keys = property.getKeys();
        propertyInfo.keyCount = keys ? (keys.length !== undefined ? keys.length : keys.numItems) : 0;
        propertyInfo.keys = [];
        if (keys) {
          var keyLength = keys.length !== undefined ? keys.length : keys.numItems;
          for (var keyIndex = 0; keyIndex < keyLength; keyIndex++) {
            var keyTime = keys[keyIndex];
            var keyInfo = { ticks: String(keyTime.ticks) };
            try {
              var keyValue = property.getValueAtKey(keyTime);
              keyInfo.value = (typeof keyValue === "object") ? JSON.stringify(keyValue) : String(keyValue);
            } catch (ignoreKeyValue) {}
            propertyInfo.keys.push(keyInfo);
          }
        }
      } catch (ignoreKeys) {}
      try {
        var value = property.getValue();
        propertyInfo.value = (typeof value === "object") ? JSON.stringify(value) : String(value);
      } catch (ignoreValue) {}
      info.properties.push(propertyInfo);
    }
    out.push(info);
  }
  return out;
};

PMB.findQEPreset = function (premiereName) {
  var exact = null;
  try { exact = qe.project.getVideoEffectByName(premiereName); } catch (ignoreDirect) {}
  try { if (exact && String(exact.name) === premiereName) return exact; } catch (ignoreExactName) {}

  var list;
  try { list = qe.project.getVideoEffectList(); } catch (ignoreList) { return null; }
  for (var i = 0; i < list.length; i++) {
    var name = "";
    try { name = String(list[i].displayName || list[i].name || list[i]); } catch (ignoreName) {}
    if (name === premiereName) {
      try { return qe.project.getVideoEffectByName(name); } catch (ignoreLookup) { return null; }
    }
  }
  return null;
};

PMB.xmlObjectById = function (xml, objectId) {
  var children = xml.children();
  for (var i = 0; i < children.length(); i++) {
    var id = "";
    try { id = String(children[i].@ObjectID); } catch (ignoreId) {}
    if (id === String(objectId)) return children[i];
  }
  return null;
};

PMB.xmlTag = function (node, tagName) {
  if (!node) return "";
  var children = node.children();
  for (var i = 0; i < children.length(); i++) {
    try {
      if (String(children[i].name().localName) === tagName) return String(children[i]);
    } catch (ignoreName) {}
  }
  return "";
};

PMB.parsePresetValue = function (raw) {
  var value = String(raw === undefined || raw === null ? "" : raw);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.indexOf(":") >= 0) {
    var parts = value.split(":");
    var point = [];
    for (var i = 0; i < parts.length; i++) point.push(Number(parts[i]));
    return point;
  }
  var number = Number(value);
  return isNaN(number) ? value : number;
};

PMB.parseKeyframeRecord = function (record) {
  var fields = String(record).split(",");
  if (fields.length < 2) return null;
  return {
    ticks: Number(fields[0]),
    value: PMB.parsePresetValue(fields[1]),
    interpolation: fields.length > 2 ? Number(fields[2]) : 0
  };
};

PMB.parsePresetParameter = function (node, index) {
  var start = PMB.xmlTag(node, "StartKeyframe");
  var startRecord = start ? PMB.parseKeyframeRecord(start) : null;
  var keyframes = [];
  var rawKeyframes = PMB.xmlTag(node, "Keyframes");
  if (rawKeyframes) {
    var records = rawKeyframes.split(";");
    for (var i = 0; i < records.length; i++) {
      if (!records[i]) continue;
      var parsed = PMB.parseKeyframeRecord(records[i]);
      if (parsed) keyframes.push(parsed);
    }
  }
  return {
    index: index,
    name: PMB.xmlTag(node, "Name"),
    parameterId: PMB.xmlTag(node, "ParameterID"),
    timeVarying: PMB.xmlTag(node, "IsTimeVarying") === "true",
    startValue: startRecord ? startRecord.value : null,
    keyframes: keyframes
  };
};

PMB.parsePresetXml = function (file, premiereName) {
  if (!file || !file.exists || !file.open("r")) return null;
  var contents = "";
  try {
    file.encoding = "UTF-8";
    contents = file.read();
  } finally {
    try { file.close(); } catch (ignoreClose) {}
  }
  var xml = new XML(contents);
  var treeItems = xml.TreeItem;
  var dataRef = "";
  for (var i = 0; i < treeItems.length(); i++) {
    if (String(treeItems[i].TreeItemBase.Name) === premiereName) {
      dataRef = String(treeItems[i].TreeItemBase.Data.@ObjectRef);
      break;
    }
  }
  if (!dataRef) return null;
  var presetItem = PMB.xmlObjectById(xml, dataRef);
  if (!presetItem) return null;
  var presetRefs = presetItem.FilterPresets.FilterPreset;
  var definition = { name: premiereName, file: file.fsName, effects: [] };
  for (var presetIndex = 0; presetIndex < presetRefs.length(); presetIndex++) {
    var presetRef = String(presetRefs[presetIndex].@ObjectRef);
    var filterPreset = PMB.xmlObjectById(xml, presetRef);
    if (!filterPreset) continue;
    var componentRef = String(filterPreset.Component.@ObjectRef);
    var componentNode = PMB.xmlObjectById(xml, componentRef);
    if (!componentNode) continue;
    var effect = {
      anchorInTicks: Number(String(filterPreset.AnchorInPoint)),
      anchorOutTicks: Number(String(filterPreset.AnchorOutPoint)),
      matchName: PMB.xmlTag(filterPreset, "FilterMatchName") || PMB.xmlTag(componentNode, "MatchName"),
      displayName: String(componentNode.Component.DisplayName),
      instanceName: String(componentNode.Component.InstanceName),
      parameters: []
    };
    var paramRefs = componentNode.Component.Params.Param;
    for (var paramIndex = 0; paramIndex < paramRefs.length(); paramIndex++) {
      var paramNode = PMB.xmlObjectById(xml, String(paramRefs[paramIndex].@ObjectRef));
      if (paramNode) effect.parameters.push(PMB.parsePresetParameter(paramNode, Number(String(paramRefs[paramIndex].@Index))));
    }
    definition.effects.push(effect);
  }
  return definition.effects.length ? definition : null;
};

PMB.findSavedPresetDefinition = function (premiereName) {
  var premiereRoot = new Folder(Folder.myDocuments.fsName + "/Adobe/Premiere Pro");
  if (!premiereRoot.exists) return null;
  var major = String(app.version || "").split(".")[0];
  var versionFolder = new Folder(premiereRoot.fsName + "/" + major + ".0");
  var versions = versionFolder.exists ? [versionFolder] : premiereRoot.getFiles(function (entry) { return entry instanceof Folder; });
  for (var versionIndex = 0; versionIndex < versions.length; versionIndex++) {
    var profiles = versions[versionIndex].getFiles(function (entry) { return entry instanceof Folder && String(entry.name).indexOf("Profile-") === 0; });
    for (var profileIndex = 0; profileIndex < profiles.length; profileIndex++) {
      var presetFile = new File(profiles[profileIndex].fsName + "/Effect Presets and Custom Items.prfpset");
      if (!presetFile.exists) continue;
      try {
        var definition = PMB.parsePresetXml(presetFile, premiereName);
        if (definition) return definition;
      } catch (parseError) {
        PMB.log("BRIDGE_ERROR", "preset XML parse failed: " + parseError);
      }
    }
  }
  return null;
};

PMB.componentMatchesEffect = function (component, effect) {
  var componentMatch = "";
  var displayName = "";
  try { componentMatch = String(component.matchName || ""); } catch (ignoreMatch) {}
  try { displayName = String(component.displayName || ""); } catch (ignoreDisplay) {}
  return componentMatch === effect.matchName || displayName === effect.displayName;
};

PMB.findComponentForEffect = function (clip, effect, minimumOccurrence) {
  var occurrence = 0;
  var fallback = null;
  for (var i = 0; i < clip.components.numItems; i++) {
    var component = clip.components[i];
    if (PMB.componentMatchesEffect(component, effect)) {
      fallback = component;
      if (occurrence >= minimumOccurrence) return component;
      occurrence++;
    }
  }
  return fallback;
};

PMB.countComponentsForEffect = function (clip, effect) {
  var count = 0;
  for (var i = 0; i < clip.components.numItems; i++) {
    if (PMB.componentMatchesEffect(clip.components[i], effect)) count++;
  }
  return count;
};

PMB.applyPresetParameter = function (property, parameter, effect, clip) {
  if (!property) return;
  if (parameter.timeVarying && parameter.keyframes.length) {
    property.setTimeVarying(true);
    var baseSeconds = Number(clip.inPoint.seconds);
    for (var i = 0; i < parameter.keyframes.length; i++) {
      var sourceTime = new Time();
      sourceTime.seconds = baseSeconds + ((parameter.keyframes[i].ticks - effect.anchorInTicks) / PMB.TICKS_PER_SECOND);
      try { property.addKey(sourceTime); } catch (ignoreAddKey) {}
      property.setValueAtKey(sourceTime, parameter.keyframes[i].value, true);
      try { property.setInterpolationTypeAtKey(sourceTime, parameter.keyframes[i].interpolation, true); } catch (ignoreInterpolation) {}
    }
  } else if (parameter.startValue !== null) {
    property.setValue(parameter.startValue, true);
  }
};

PMB.applySavedPresetDefinition = function (definition, seq, located, qeClip) {
  for (var effectIndex = 0; effectIndex < definition.effects.length; effectIndex++) {
    var effect = definition.effects[effectIndex];
    var beforeCount = PMB.countComponentsForEffect(located.clip, effect);
    var qeEffect = null;
    try { qeEffect = qe.project.getVideoEffectByName(effect.displayName); } catch (ignoreDisplayLookup) {}
    if (!qeEffect || String(qeEffect.name || "") !== effect.displayName) {
      try { qeEffect = qe.project.getVideoEffectByName(effect.matchName); } catch (ignoreMatchLookup) {}
    }
    if (!qeEffect) throw new Error("base effect unavailable: " + effect.displayName + " (" + effect.matchName + ")");
    qeClip.addVideoEffect(qeEffect);
    var refreshed = seq.videoTracks[located.trackIndex].clips[located.clipIndex];
    var component = PMB.findComponentForEffect(refreshed, effect, beforeCount);
    if (!component) throw new Error("added component not found: " + effect.matchName);
    for (var parameterIndex = 0; parameterIndex < effect.parameters.length; parameterIndex++) {
      var parameter = effect.parameters[parameterIndex];
      var property = null;
      if (parameter.index < component.properties.numItems) property = component.properties[parameter.index];
      if (!property && parameter.name) {
        try { property = component.properties.getParamForDisplayName(parameter.name); } catch (ignorePropertyLookup) {}
      }
      PMB.applyPresetParameter(property, parameter, effect, refreshed);
    }
    located.clip = refreshed;
  }
};

PMB.applyPreset = function (command) {
  var seq = PMB.activeSequence();
  if (!seq) return PMB.fail("NO_ACTIVE_SEQUENCE");
  var located = PMB.findSelectedVideoClip(seq);
  if (!located) return PMB.fail("NO_SELECTED_CLIP");

  PMB.log("PRESET_SEARCH_START", command.premiereName);
  try { app.enableQE(); } catch (qeEnableError) {
    return PMB.fail("BRIDGE_ERROR", "QE enable failed: " + qeEnableError);
  }
  var qeSeq;
  try { qeSeq = qe.project.getActiveSequence(); } catch (qeSequenceError) {}
  if (!qeSeq) return PMB.fail("NO_ACTIVE_SEQUENCE", "QE active sequence missing");
  var qeTrack = qeSeq.getVideoTrackAt(located.trackIndex);
  var qeClip = qeTrack && PMB.findQEClip(qeTrack, located.clip.start.ticks, located.clip.name);
  if (!qeClip) return PMB.fail("BRIDGE_ERROR", "selected clip not found in QE DOM");

  var before = PMB.componentSnapshot(located.clip);
  var preset = PMB.findQEPreset(command.premiereName);
  var savedPreset = null;
  if (!preset) savedPreset = PMB.findSavedPresetDefinition(command.premiereName);
  if (!preset && !savedPreset) return PMB.fail("PRESET_NOT_FOUND", command.premiereName);
  PMB.log("PRESET_FOUND", command.premiereName + (savedPreset ? " (.prfpset fallback)" : " (QE)"));

  try {
    if (preset) qeClip.addVideoEffect(preset);
    else PMB.applySavedPresetDefinition(savedPreset, seq, located, qeClip);
  } catch (applyError) {
    return PMB.fail("BRIDGE_ERROR", "preset apply failed: " + applyError);
  }
  var refreshed = seq.videoTracks[located.trackIndex].clips[located.clipIndex];
  var after = PMB.componentSnapshot(refreshed);
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return PMB.fail("BRIDGE_ERROR", "QE accepted the preset call but clip state did not change");
  }
  PMB.log("PRESET_APPLIED", command.premiereName);
  return {
    ok: true,
    action: "applyPreset",
    preset: command.premiereName,
    sequence: seq.name,
    clip: located.clip.name,
    trackIndex: located.trackIndex,
    before: before,
    after: after,
    events: PMB.events
  };
};

PMB.samePath = function (left, right) {
  try { return new File(left).fsName === new File(right).fsName; } catch (ignore) { return String(left) === String(right); }
};

PMB.findProjectItemByPath = function (root, mediaPath) {
  if (!root) return null;
  var children;
  try { children = root.children; } catch (ignoreChildren) { return null; }
  for (var i = 0; i < children.numItems; i++) {
    var child = children[i];
    try {
      var childPath = child.getMediaPath();
      if (childPath && PMB.samePath(childPath, mediaPath)) return child;
    } catch (ignorePath) {}
    var nested = PMB.findProjectItemByPath(child, mediaPath);
    if (nested) return nested;
  }
  return null;
};

PMB.audioDurationTicks = function (projectItem) {
  try {
    var inPoint = projectItem.getInPoint(2);
    var outPoint = projectItem.getOutPoint(2);
    var duration = PMB.ticks(outPoint) - PMB.ticks(inPoint);
    if (duration > 0) return duration;
  } catch (ignoreAudioDuration) {}
  try {
    var allIn = projectItem.getInPoint();
    var allOut = projectItem.getOutPoint();
    var allDuration = PMB.ticks(allOut) - PMB.ticks(allIn);
    if (allDuration > 0) return allDuration;
  } catch (ignoreAllDuration) {}
  return 1;
};

PMB.trackIsFreeAtTime = function (track, startTicks, durationTicks) {
  var endTicks = startTicks + Math.max(1, durationTicks || 1);
  for (var i = 0; i < track.clips.numItems; i++) {
    var clip = track.clips[i];
    var clipStart = PMB.ticks(clip.start);
    var clipEnd = PMB.ticks(clip.end);
    if (clipStart < endTicks && startTicks < clipEnd) return false;
  }
  return true;
};

PMB.findFirstFreeAudioTrackAtTime = function (seq, time, durationTicks) {
  var startTicks = PMB.ticks(time);
  for (var i = 0; i < seq.audioTracks.numTracks; i++) {
    if (PMB.trackIsFreeAtTime(seq.audioTracks[i], startTicks, durationTicks)) return i;
  }
  try {
    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    var audioCount = seq.audioTracks.numTracks;
    qeSeq.addTracks(0, seq.videoTracks.numTracks, 1, 1, audioCount, 0, 1);
    if (seq.audioTracks.numTracks > audioCount) return audioCount;
  } catch (ignoreAddTrack) {}
  return -1;
};

PMB.insertSfx = function (command) {
  var seq = PMB.activeSequence();
  if (!seq) return PMB.fail("NO_ACTIVE_SEQUENCE");
  if (!command.path || !(new File(command.path)).exists) return PMB.fail("SFX_NOT_FOUND", command.path || "empty config path");

  var playhead = seq.getPlayerPosition();
  var playheadTicks = PMB.ticks(playhead);
  PMB.log("PLAYHEAD_TIME", playheadTicks);

  var item = PMB.findProjectItemByPath(app.project.rootItem, command.path);
  if (item) {
    PMB.log("SFX_FOUND_IN_PROJECT", item.name);
  } else {
    var imported = false;
    try { imported = app.project.importFiles([command.path], true, app.project.rootItem, false); } catch (ignoreImport) {}
    if (!imported) return PMB.fail("IMPORT_FAILED", command.path);
    item = PMB.findProjectItemByPath(app.project.rootItem, command.path);
    if (!item) return PMB.fail("IMPORT_FAILED", "import returned success but ProjectItem was not found");
    PMB.log("SFX_IMPORTED", item.name);
  }

  var durationTicks = PMB.audioDurationTicks(item);
  var trackIndex = PMB.findFirstFreeAudioTrackAtTime(seq, playhead, durationTicks);
  if (trackIndex < 0) return PMB.fail("NO_FREE_TRACK");
  PMB.log("FREE_AUDIO_TRACK_FOUND", "A" + (trackIndex + 1));

  var track = seq.audioTracks[trackIndex];
  try { track.overwriteClip(item, String(playheadTicks)); } catch (insertError) {
    return PMB.fail("INSERT_FAILED", String(insertError));
  }

  var inserted = null;
  for (var i = 0; i < track.clips.numItems; i++) {
    var clip = track.clips[i];
    if (PMB.ticks(clip.start) === playheadTicks) {
      try {
        if (clip.projectItem && clip.projectItem.nodeId === item.nodeId) inserted = clip;
      } catch (ignoreVerify) {}
    }
  }
  if (!inserted) return PMB.fail("INSERT_FAILED", "timeline verification failed");
  PMB.log("SFX_INSERTED", inserted.name + " on A" + (trackIndex + 1));
  return {
    ok: true,
    action: "insertSfx",
    sequence: seq.name,
    item: inserted.name,
    trackIndex: trackIndex,
    playheadTicks: String(playheadTicks),
    insertedStartTicks: String(inserted.start.ticks),
    events: PMB.events
  };
};

PMB.inspectSelectedClip = function () {
  var seq = PMB.activeSequence();
  if (!seq) return PMB.fail("NO_ACTIVE_SEQUENCE");
  var located = PMB.findSelectedVideoClip(seq);
  if (!located) return PMB.fail("NO_SELECTED_CLIP");
  return {
    ok: true,
    action: "inspectSelectedClip",
    sequence: seq.name,
    clip: located.clip.name,
    trackIndex: located.trackIndex,
    components: PMB.componentSnapshot(located.clip),
    events: PMB.events
  };
};

PMB.inspectTimeline = function () {
  var seq = PMB.activeSequence();
  if (!seq) return PMB.fail("NO_ACTIVE_SEQUENCE");
  var result = { ok: true, action: "inspectTimeline", sequence: seq.name, playheadTicks: String(seq.getPlayerPosition().ticks), videoTracks: [], audioTracks: [], events: PMB.events };
  var i, j, track, clips, clip;
  for (i = 0; i < seq.videoTracks.numTracks; i++) {
    track = seq.videoTracks[i];
    clips = [];
    for (j = 0; j < track.clips.numItems; j++) {
      clip = track.clips[j];
      clips.push({ name: clip.name, startTicks: String(clip.start.ticks), endTicks: String(clip.end.ticks), selected: !!clip.isSelected() });
    }
    result.videoTracks.push({ index: i, clips: clips });
  }
  for (i = 0; i < seq.audioTracks.numTracks; i++) {
    track = seq.audioTracks[i];
    clips = [];
    for (j = 0; j < track.clips.numItems; j++) {
      clip = track.clips[j];
      clips.push({ name: clip.name, startTicks: String(clip.start.ticks), endTicks: String(clip.end.ticks), selected: !!clip.isSelected() });
    }
    result.audioTracks.push({ index: i, clips: clips });
  }
  return result;
};

PMB.inspectPreset = function (command) {
  PMB.log("PRESET_SEARCH_START", command.premiereName);
  try { app.enableQE(); } catch (error) { return PMB.fail("BRIDGE_ERROR", String(error)); }
  var preset = PMB.findQEPreset(command.premiereName);
  if (!preset) return PMB.fail("PRESET_NOT_FOUND", command.premiereName);
  PMB.log("PRESET_FOUND", command.premiereName);
  var name = command.premiereName;
  try { name = String(preset.displayName || preset.name || command.premiereName); } catch (ignore) {}
  return { ok: true, action: "inspectPreset", preset: name, events: PMB.events };
};

PMB.inspectProject = function () {
  var out = { ok: true, action: "inspectProject", sequences: [], projectItems: [] };
  var i, j, sequence, videoClips, audioClips;
  for (i = 0; i < app.project.sequences.numSequences; i++) {
    sequence = app.project.sequences[i];
    videoClips = 0;
    audioClips = 0;
    for (j = 0; j < sequence.videoTracks.numTracks; j++) videoClips += sequence.videoTracks[j].clips.numItems;
    for (j = 0; j < sequence.audioTracks.numTracks; j++) audioClips += sequence.audioTracks[j].clips.numItems;
    out.sequences.push({ name: sequence.name, sequenceID: String(sequence.sequenceID), videoClips: videoClips, audioClips: audioClips });
  }
  var walk = function (item, depth) {
    if (!item || depth > 6) return;
    var children;
    try { children = item.children; } catch (ignoreChildren) { return; }
    if (!children) return;
    for (var k = 0; k < children.numItems; k++) {
      var child = children[k];
      var info = { name: String(child.name || ""), type: String(child.type || "") };
      try { info.mediaPath = String(child.getMediaPath() || ""); } catch (ignorePath) {}
      out.projectItems.push(info);
      walk(child, depth + 1);
    }
  };
  walk(app.project.rootItem, 0);
  return out;
};

PMB.dispatch = function (commandJson) {
  PMB.events = [];
  try {
    var command = JSON.parse(commandJson);
    var result;
    if (command.action === "applyPreset") result = PMB.applyPreset(command);
    else if (command.action === "insertSfx") result = PMB.insertSfx(command);
    else if (command.action === "inspectSelectedClip") result = PMB.inspectSelectedClip(command);
    else if (command.action === "inspectTimeline") result = PMB.inspectTimeline(command);
    else if (command.action === "inspectPreset") result = PMB.inspectPreset(command);
    else if (command.action === "inspectProject") result = PMB.inspectProject(command);
    else result = PMB.fail("BRIDGE_ERROR", "unknown action: " + command.action);
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify(PMB.fail("BRIDGE_ERROR", String(error)));
  }
};
