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

PMB.findSelectedVideoClip = function (seq, allowPlayheadFallback) {
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

  if (allowPlayheadFallback !== true) return null;

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

PMB.findQEVideoEffect = function (premiereName) {
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

PMB.applyEffect = function (command) {
  var seq = PMB.activeSequence();
  if (!seq) return PMB.fail("NO_ACTIVE_SEQUENCE");
  var located = PMB.findSelectedVideoClip(seq, false);
  if (!located) return PMB.fail("NO_SELECTED_CLIP");

  PMB.log("EFFECT_SEARCH_START", command.premiereName);
  try { app.enableQE(); } catch (enableError) {
    return PMB.fail("EFFECT_APPLY_FAILED", "QE unavailable: " + String(enableError));
  }
  var effect = PMB.findQEVideoEffect(command.premiereName);
  if (!effect) return PMB.fail("EFFECT_NOT_FOUND", command.premiereName);
  PMB.log("EFFECT_FOUND", command.premiereName);

  var qeSeq;
  var qeTrack;
  var qeClip;
  try {
    qeSeq = qe.project.getActiveSequence();
    qeTrack = qeSeq.getVideoTrackAt(located.trackIndex);
    qeClip = PMB.findQEClip(qeTrack, located.clip.start.ticks, located.clip.name);
  } catch (locateError) {
    return PMB.fail("EFFECT_APPLY_FAILED", "QE target lookup failed: " + String(locateError));
  }
  if (!qeClip) return PMB.fail("EFFECT_APPLY_FAILED", "QE target clip not found");

  var before = PMB.componentSnapshot(located.clip);
  try { qeClip.addVideoEffect(effect); } catch (applyError) {
    return PMB.fail("EFFECT_APPLY_FAILED", String(applyError));
  }
  var after = PMB.componentSnapshot(located.clip);
  if (after.length <= before.length) {
    return PMB.fail("EFFECT_APPLY_FAILED", "component count did not increase");
  }
  var beforeCounts = {};
  var seenCounts = {};
  var i;
  for (i = 0; i < before.length; i++) {
    var beforeKey = before[i].matchName || before[i].name;
    beforeCounts[beforeKey] = (beforeCounts[beforeKey] || 0) + 1;
  }
  var added = null;
  for (i = 0; i < after.length; i++) {
    var afterKey = after[i].matchName || after[i].name;
    seenCounts[afterKey] = (seenCounts[afterKey] || 0) + 1;
    if (!added && seenCounts[afterKey] > (beforeCounts[afterKey] || 0)) added = after[i];
  }
  if (!added || added.name !== command.premiereName) {
    return PMB.fail("EFFECT_APPLY_FAILED", "new component does not match " + command.premiereName);
  }
  PMB.log("EFFECT_APPLIED", command.premiereName);
  return {
    ok: true,
    action: "applyEffect",
    effect: command.premiereName,
    sequence: seq.name,
    clip: located.clip.name,
    trackIndex: located.trackIndex,
    addedComponent: added,
    componentCountBefore: before.length,
    componentCountAfter: after.length,
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
  if (!children) return null;
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
  return -1;
};

PMB.findFirstFreeVideoTrackAtTime = function (seq, time, durationTicks) {
  var startTicks = PMB.ticks(time);
  for (var i = 0; i < seq.videoTracks.numTracks; i++) {
    if (PMB.trackIsFreeAtTime(seq.videoTracks[i], startTicks, durationTicks)) return i;
  }
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
    if (!imported) return PMB.fail("SFX_IMPORT_FAILED", command.path);
    item = PMB.findProjectItemByPath(app.project.rootItem, command.path);
    if (!item) return PMB.fail("SFX_IMPORT_FAILED", "import returned success but ProjectItem was not found");
    PMB.log("SFX_IMPORTED", item.name);
  }

  var durationTicks = PMB.audioDurationTicks(item);
  var trackIndex = PMB.findFirstFreeAudioTrackAtTime(seq, playhead, durationTicks);
  if (trackIndex < 0) return PMB.fail("NO_FREE_AUDIO_TRACK");
  PMB.log("FREE_AUDIO_TRACK_FOUND", "A" + (trackIndex + 1));

  var track = seq.audioTracks[trackIndex];
  try { track.overwriteClip(item, String(playheadTicks)); } catch (insertError) {
    return PMB.fail("SFX_INSERT_FAILED", String(insertError));
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
  if (!inserted) return PMB.fail("SFX_INSERT_FAILED", "timeline verification failed");
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

PMB.insertMogrt = function (command) {
  var seq = PMB.activeSequence();
  if (!seq) return PMB.fail("NO_ACTIVE_SEQUENCE");
  if (!command.path || !(new File(command.path)).exists) return PMB.fail("MOGRT_NOT_FOUND", command.path || "empty config path");

  var durationSeconds = Number(command.durationSeconds || 0);
  if (!(durationSeconds > 0)) return PMB.fail("MOGRT_INSERT_FAILED", "durationSeconds must be configured for collision-safe placement");
  var durationTicks = Math.round(durationSeconds * PMB.TICKS_PER_SECOND);
  var playhead = seq.getPlayerPosition();
  var playheadTicks = PMB.ticks(playhead);
  PMB.log("PLAYHEAD_TIME", playheadTicks);

  var videoTrackIndex = PMB.findFirstFreeVideoTrackAtTime(seq, playhead, durationTicks);
  if (videoTrackIndex < 0) return PMB.fail("NO_FREE_VIDEO_TRACK");
  var audioTrackIndex = PMB.findFirstFreeAudioTrackAtTime(seq, playhead, durationTicks);
  if (audioTrackIndex < 0) return PMB.fail("NO_FREE_AUDIO_TRACK", "no safe audio target for MOGRT");
  PMB.log("FREE_VIDEO_TRACK_FOUND", "V" + (videoTrackIndex + 1));

  var inserted;
  try {
    inserted = seq.importMGT(command.path, String(playheadTicks), videoTrackIndex, audioTrackIndex);
  } catch (insertError) {
    return PMB.fail("MOGRT_INSERT_FAILED", String(insertError));
  }
  if (!inserted) return PMB.fail("MOGRT_INSERT_FAILED", "Premiere returned no TrackItem");

  var insertedStart = PMB.ticks(inserted.start);
  if (insertedStart !== playheadTicks) {
    return PMB.fail("MOGRT_INSERT_FAILED", "timeline verification failed: wrong start time");
  }
  var insertedDuration = PMB.ticks(inserted.end) - insertedStart;
  if (insertedDuration > durationTicks) {
    return PMB.fail("MOGRT_INSERT_FAILED", "inserted duration exceeds configured collision window");
  }
  PMB.log("MOGRT_INSERTED", inserted.name + " on V" + (videoTrackIndex + 1));
  return {
    ok: true,
    action: "insertMogrt",
    sequence: seq.name,
    item: inserted.name,
    videoTrackIndex: videoTrackIndex,
    audioTrackIndex: audioTrackIndex,
    playheadTicks: String(playheadTicks),
    insertedStartTicks: String(inserted.start.ticks),
    insertedEndTicks: String(inserted.end.ticks),
    events: PMB.events
  };
};

PMB.inspectSelectedClip = function () {
  var seq = PMB.activeSequence();
  if (!seq) return PMB.fail("NO_ACTIVE_SEQUENCE");
  var located = PMB.findSelectedVideoClip(seq, false);
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
    if (command.action === "applyEffect") result = PMB.applyEffect(command);
    else if (command.action === "insertSfx") result = PMB.insertSfx(command);
    else if (command.action === "insertMogrt") result = PMB.insertMogrt(command);
    else if (command.action === "inspectSelectedClip") result = PMB.inspectSelectedClip(command);
    else if (command.action === "inspectTimeline") result = PMB.inspectTimeline(command);
    else if (command.action === "inspectProject") result = PMB.inspectProject(command);
    else result = PMB.fail("BRIDGE_ERROR", "unknown action: " + command.action);
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify(PMB.fail("BRIDGE_ERROR", String(error)));
  }
};
