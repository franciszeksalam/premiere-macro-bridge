#import <Carbon/Carbon.h>
#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

@interface PMBHotkeyBridge : NSObject
@property(nonatomic, strong) NSDictionary<NSNumber *, NSString *> *actions;
@property(nonatomic, strong) NSURL *endpoint;
@property(nonatomic, strong) NSURL *logURL;
- (instancetype)initWithConfigPath:(NSString *)configPath validateOnly:(BOOL)validateOnly error:(NSError **)error;
- (void)fire:(UInt32)numericID;
@end

static OSStatus PMBHotkeyHandler(EventHandlerCallRef nextHandler, EventRef event, void *userData) {
    EventHotKeyID hotkeyID = {0};
    OSStatus status = GetEventParameter(event, kEventParamDirectObject, typeEventHotKeyID,
                                        NULL, sizeof(hotkeyID), NULL, &hotkeyID);
    if (status == noErr && userData) {
        PMBHotkeyBridge *bridge = (__bridge PMBHotkeyBridge *)userData;
        [bridge fire:hotkeyID.id];
    }
    return noErr;
}

static UInt32 PMBKeyCode(NSString *key) {
    NSDictionary<NSString *, NSNumber *> *map = @{
        @"0": @(kVK_ANSI_0), @"1": @(kVK_ANSI_1), @"2": @(kVK_ANSI_2),
        @"3": @(kVK_ANSI_3), @"4": @(kVK_ANSI_4), @"5": @(kVK_ANSI_5),
        @"6": @(kVK_ANSI_6), @"7": @(kVK_ANSI_7), @"8": @(kVK_ANSI_8),
        @"9": @(kVK_ANSI_9), @"a": @(kVK_ANSI_A), @"b": @(kVK_ANSI_B),
        @"c": @(kVK_ANSI_C), @"d": @(kVK_ANSI_D), @"e": @(kVK_ANSI_E),
        @"f": @(kVK_ANSI_F), @"g": @(kVK_ANSI_G), @"h": @(kVK_ANSI_H),
        @"i": @(kVK_ANSI_I), @"j": @(kVK_ANSI_J), @"k": @(kVK_ANSI_K),
        @"l": @(kVK_ANSI_L), @"m": @(kVK_ANSI_M), @"n": @(kVK_ANSI_N),
        @"o": @(kVK_ANSI_O), @"p": @(kVK_ANSI_P), @"q": @(kVK_ANSI_Q),
        @"r": @(kVK_ANSI_R), @"s": @(kVK_ANSI_S), @"t": @(kVK_ANSI_T),
        @"u": @(kVK_ANSI_U), @"v": @(kVK_ANSI_V), @"w": @(kVK_ANSI_W),
        @"x": @(kVK_ANSI_X), @"y": @(kVK_ANSI_Y), @"z": @(kVK_ANSI_Z)
    };
    NSNumber *value = map[key.lowercaseString];
    return value ? value.unsignedIntValue : UINT32_MAX;
}

static NSDictionary *PMBParseHotkey(id value, NSString **reason) {
    if (![value isKindOfClass:NSString.class] || ![(NSString *)value length]) {
        if (reason) *reason = @"hotkey must be a non-empty string";
        return nil;
    }
    NSDictionary<NSString *, NSString *> *aliases = @{
        @"ctrl": @"ctrl", @"control": @"ctrl",
        @"alt": @"alt", @"option": @"alt",
        @"shift": @"shift",
        @"cmd": @"cmd", @"command": @"cmd"
    };
    NSMutableSet<NSString *> *modifiers = [NSMutableSet set];
    NSString *key = nil;
    for (NSString *rawToken in [(NSString *)value componentsSeparatedByString:@"+"]) {
        NSString *token = [rawToken.lowercaseString stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
        NSString *modifier = aliases[token];
        if (modifier) {
            if ([modifiers containsObject:modifier]) {
                if (reason) *reason = [NSString stringWithFormat:@"duplicate hotkey modifier: %@", token];
                return nil;
            }
            [modifiers addObject:modifier];
        } else if (token.length == 1 && PMBKeyCode(token) != UINT32_MAX && !key) {
            key = token;
        } else {
            if (reason) *reason = [NSString stringWithFormat:@"unsupported hotkey token: %@", token];
            return nil;
        }
    }
    if (!key) {
        if (reason) *reason = @"hotkey requires one letter or digit";
        return nil;
    }
    if (![modifiers containsObject:@"ctrl"] && ![modifiers containsObject:@"alt"] && ![modifiers containsObject:@"cmd"]) {
        if (reason) *reason = @"hotkey requires at least one of ctrl, alt, or cmd";
        return nil;
    }
    UInt32 flags = 0;
    NSMutableArray<NSString *> *canonical = [NSMutableArray array];
    if ([modifiers containsObject:@"ctrl"]) { flags |= controlKey; [canonical addObject:@"ctrl"]; }
    if ([modifiers containsObject:@"alt"]) { flags |= optionKey; [canonical addObject:@"alt"]; }
    if ([modifiers containsObject:@"shift"]) { flags |= shiftKey; [canonical addObject:@"shift"]; }
    if ([modifiers containsObject:@"cmd"]) { flags |= cmdKey; [canonical addObject:@"cmd"]; }
    [canonical addObject:key];
    return @{
        @"keyCode": @(PMBKeyCode(key)),
        @"modifiers": @(flags),
        @"canonical": [canonical componentsJoinedByString:@"+"]
    };
}

@implementation PMBHotkeyBridge

- (void)log:(NSString *)message {
    NSString *timestamp = [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]];
    NSString *line = [NSString stringWithFormat:@"%@ %@\n", timestamp, message];
    fwrite(line.UTF8String, 1, strlen(line.UTF8String), stdout);
    fflush(stdout);
    NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:self.logURL.path];
    NSData *data = [line dataUsingEncoding:NSUTF8StringEncoding];
    if (handle) {
        @try {
            [handle seekToEndOfFile];
            [handle writeData:data];
            [handle closeFile];
        } @catch (__unused NSException *exception) {}
    } else {
        [data writeToURL:self.logURL atomically:YES];
    }
}

- (BOOL)validateAction:(NSDictionary *)action actionID:(NSString *)actionID {
    if (![action isKindOfClass:NSDictionary.class]) {
        [self log:[NSString stringWithFormat:@"INVALID_ACTION_CONFIG actionId=%@ action must be an object", actionID]];
        return NO;
    }
    NSString *type = action[@"type"];
    if (![type isKindOfClass:NSString.class] ||
        (!([type isEqualToString:@"effect"] || [type isEqualToString:@"sfx"] || [type isEqualToString:@"mogrt"]))) {
        [self log:[NSString stringWithFormat:@"UNKNOWN_ACTION_TYPE actionId=%@ type=%@", actionID, type ?: @""]];
        return NO;
    }
    if ([type isEqualToString:@"effect"]) {
        NSString *name = action[@"premiereName"];
        if (![name isKindOfClass:NSString.class] || !name.length) {
            [self log:[NSString stringWithFormat:@"INVALID_ACTION_CONFIG actionId=%@ effect requires premiereName", actionID]];
            return NO;
        }
        return YES;
    }
    NSString *path = action[@"path"];
    if (![path isKindOfClass:NSString.class] || !path.length) {
        [self log:[NSString stringWithFormat:@"INVALID_ACTION_CONFIG actionId=%@ %@ requires path", actionID, type]];
        return NO;
    }
    if ([type isEqualToString:@"mogrt"] && [action[@"durationSeconds"] doubleValue] <= 0) {
        [self log:[NSString stringWithFormat:@"INVALID_ACTION_CONFIG actionId=%@ mogrt requires durationSeconds > 0", actionID]];
        return NO;
    }
    return YES;
}

- (instancetype)initWithConfigPath:(NSString *)configPath validateOnly:(BOOL)validateOnly error:(NSError **)error {
    self = [super init];
    if (!self) return nil;

    NSURL *logs = [NSFileManager.defaultManager.homeDirectoryForCurrentUser
                   URLByAppendingPathComponent:@"Library/Logs/PremiereMacroBridge" isDirectory:YES];
    [NSFileManager.defaultManager createDirectoryAtURL:logs withIntermediateDirectories:YES attributes:nil error:nil];
    self.logURL = [logs URLByAppendingPathComponent:@"hotkeys.log"];

    NSData *data = [NSData dataWithContentsOfFile:configPath options:0 error:error];
    if (!data) return nil;
    NSDictionary *root = [NSJSONSerialization JSONObjectWithData:data options:0 error:error];
    if (![root isKindOfClass:NSDictionary.class]) return nil;
    NSDictionary *configuredActions = root[@"actions"];
    if (![configuredActions isKindOfClass:NSDictionary.class]) {
        if (error) *error = [NSError errorWithDomain:@"PremiereMacroBridge" code:3
                                            userInfo:@{NSLocalizedDescriptionKey: @"INVALID_ACTION_CONFIG config.actions must be an object"}];
        return nil;
    }

    NSInteger port = [root[@"port"] integerValue] ?: 48777;
    self.endpoint = [NSURL URLWithString:[NSString stringWithFormat:@"http://127.0.0.1:%ld/action", (long)port]];

    NSMutableArray<NSDictionary *> *candidates = [NSMutableArray array];
    NSMutableDictionary<NSString *, NSMutableArray<NSString *> *> *owners = [NSMutableDictionary dictionary];
    NSDictionary *runtimeValidation = root[@"runtimeValidation"];
    NSDictionary *invalidActions = [runtimeValidation isKindOfClass:NSDictionary.class] ? runtimeValidation[@"invalidActions"] : nil;
    NSArray<NSString *> *actionIDs = [configuredActions.allKeys sortedArrayUsingSelector:@selector(compare:)];
    for (NSString *actionID in actionIDs) {
        NSDictionary *action = configuredActions[actionID];
        NSArray *runtimeIssues = [invalidActions isKindOfClass:NSDictionary.class] ? invalidActions[actionID] : nil;
        if ([runtimeIssues isKindOfClass:NSArray.class] && runtimeIssues.count) {
            for (NSDictionary *runtimeIssue in runtimeIssues) {
                [self log:[NSString stringWithFormat:@"%@ actionId=%@ %@", runtimeIssue[@"code"] ?: @"INVALID_ACTION_CONFIG",
                           actionID, runtimeIssue[@"message"] ?: @"invalid runtime action"]];
            }
            continue;
        }
        if (![self validateAction:action actionID:actionID]) continue;
        id hotkeyValue = action[@"hotkey"];
        if (!hotkeyValue || hotkeyValue == NSNull.null || ([hotkeyValue isKindOfClass:NSString.class] && ![(NSString *)hotkeyValue length])) {
            [self log:[NSString stringWithFormat:@"ACTION_VALID_NO_HOTKEY actionId=%@", actionID]];
            continue;
        }
        NSString *reason = nil;
        NSDictionary *parsed = PMBParseHotkey(hotkeyValue, &reason);
        if (!parsed) {
            [self log:[NSString stringWithFormat:@"INVALID_ACTION_CONFIG actionId=%@ hotkey=%@ reason=%@", actionID, hotkeyValue, reason ?: @"invalid hotkey"]];
            continue;
        }
        NSMutableArray<NSString *> *hotkeyOwners = owners[parsed[@"canonical"]];
        if (!hotkeyOwners) {
            hotkeyOwners = [NSMutableArray array];
            owners[parsed[@"canonical"]] = hotkeyOwners;
        }
        [hotkeyOwners addObject:actionID];
        [candidates addObject:@{ @"actionId": actionID, @"hotkey": parsed }];
    }

    NSMutableSet<NSString *> *conflicts = [NSMutableSet set];
    for (NSString *canonical in owners) {
        NSArray<NSString *> *hotkeyOwners = owners[canonical];
        if (hotkeyOwners.count < 2) continue;
        for (NSString *actionID in hotkeyOwners) {
            [conflicts addObject:actionID];
            [self log:[NSString stringWithFormat:@"DUPLICATE_HOTKEY actionId=%@ hotkey=%@ owners=%@",
                       actionID, canonical, [hotkeyOwners componentsJoinedByString:@","]]];
        }
    }

    if (!validateOnly) {
        EventTypeSpec eventType = {kEventClassKeyboard, kEventHotKeyPressed};
        OSStatus handlerStatus = InstallEventHandler(GetApplicationEventTarget(), PMBHotkeyHandler, 1,
                                                      &eventType, (__bridge void *)self, NULL);
        if (handlerStatus != noErr) {
            if (error) *error = [NSError errorWithDomain:@"PremiereMacroBridge" code:handlerStatus
                                                userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"InstallEventHandler failed: %d", handlerStatus]}];
            return nil;
        }
    }

    NSMutableDictionary<NSNumber *, NSString *> *registeredActions = [NSMutableDictionary dictionary];
    OSType signature = 'PMBH';
    UInt32 numericID = 1;
    for (NSDictionary *candidate in candidates) {
        NSString *actionID = candidate[@"actionId"];
        NSDictionary *hotkey = candidate[@"hotkey"];
        if ([conflicts containsObject:actionID]) continue;
        if (validateOnly) {
            [self log:[NSString stringWithFormat:@"HOTKEY_VALID %@ -> %@", hotkey[@"canonical"], actionID]];
            continue;
        }
        EventHotKeyID hotkeyID = {signature, numericID};
        EventHotKeyRef hotkeyRef = NULL;
        OSStatus registerStatus = RegisterEventHotKey([hotkey[@"keyCode"] unsignedIntValue],
                                                      [hotkey[@"modifiers"] unsignedIntValue], hotkeyID,
                                                      GetApplicationEventTarget(), 0, &hotkeyRef);
        if (registerStatus != noErr) {
            [self log:[NSString stringWithFormat:@"HOTKEY_REGISTRATION_FAILED actionId=%@ hotkey=%@ status=%d",
                       actionID, hotkey[@"canonical"], registerStatus]];
            continue;
        }
        registeredActions[@(numericID)] = actionID;
        [self log:[NSString stringWithFormat:@"HOTKEY_REGISTERED %@ -> %@", hotkey[@"canonical"], actionID]];
        numericID++;
    }
    self.actions = registeredActions;
    [self log:[NSString stringWithFormat:@"CONFIG_LOADED actions=%lu hotkeys=%lu",
               (unsigned long)configuredActions.count, (unsigned long)(validateOnly ? candidates.count - conflicts.count : registeredActions.count)]];
    return self;
}

- (void)postPayload:(NSDictionary *)payload completion:(void (^)(NSInteger, NSString *, NSError *))completion {
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:self.endpoint];
    request.HTTPMethod = @"POST";
    request.timeoutInterval = 10;
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    request.HTTPBody = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    [[NSURLSession.sharedSession dataTaskWithRequest:request
                                  completionHandler:^(NSData *data, NSURLResponse *response, NSError *requestError) {
        NSInteger status = [(NSHTTPURLResponse *)response statusCode];
        NSString *body = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"";
        if (completion) completion(status, body ?: @"", requestError);
    }] resume];
}

- (void)fire:(UInt32)numericID {
    NSString *actionID = self.actions[@(numericID)];
    if (!actionID) return;
    [self log:[NSString stringWithFormat:@"HOTKEY_FIRED actionId=%@", actionID]];
    [self postPayload:@{ @"actionId": actionID } completion:^(NSInteger status, NSString *body, NSError *requestError) {
        if (requestError) {
            [self log:[NSString stringWithFormat:@"BRIDGE_ERROR actionId=%@ %@", actionID, requestError.localizedDescription]];
            return;
        }
        [self log:[NSString stringWithFormat:@"BRIDGE_RESPONSE actionId=%@ status=%ld %@", actionID, (long)status, body ?: @""]];
    }];
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
        NSUInteger flag = [arguments indexOfObject:@"--config"];
        if (flag == NSNotFound || flag + 1 >= arguments.count) {
            fprintf(stderr, "usage: premiere-macro-hotkeys --config /absolute/path/config.json [--check-config]\n");
            return 64;
        }
        BOOL validateOnly = [arguments containsObject:@"--check-config"];
        NSError *error = nil;
        PMBHotkeyBridge *bridge = [[PMBHotkeyBridge alloc] initWithConfigPath:arguments[flag + 1]
                                                                 validateOnly:validateOnly error:&error];
        if (!bridge) {
            fprintf(stderr, "BRIDGE_ERROR %s\n", error.localizedDescription.UTF8String);
            return 1;
        }
        if (validateOnly) return 0;
        NSApplication *application = [NSApplication sharedApplication];
        [application setActivationPolicy:NSApplicationActivationPolicyAccessory];
        [application run];
        (void)bridge;
    }
    return 0;
}
