#import <Carbon/Carbon.h>
#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

@interface PMBHotkeyBridge : NSObject
@property(nonatomic, strong) NSDictionary<NSNumber *, NSDictionary *> *actions;
@property(nonatomic, strong) NSURL *endpoint;
@property(nonatomic, strong) NSURL *logURL;
@property(nonatomic, strong) NSDictionary *config;
- (instancetype)initWithConfigPath:(NSString *)configPath error:(NSError **)error;
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

static UInt32 PMBModifiers(NSArray<NSString *> *names) {
    UInt32 flags = 0;
    for (NSString *rawName in names) {
        NSString *name = rawName.lowercaseString;
        if ([name isEqualToString:@"control"]) flags |= controlKey;
        else if ([name isEqualToString:@"option"] || [name isEqualToString:@"alt"]) flags |= optionKey;
        else if ([name isEqualToString:@"shift"]) flags |= shiftKey;
        else if ([name isEqualToString:@"command"] || [name isEqualToString:@"cmd"]) flags |= cmdKey;
    }
    return flags;
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

- (instancetype)initWithConfigPath:(NSString *)configPath error:(NSError **)error {
    self = [super init];
    if (!self) return nil;

    NSData *data = [NSData dataWithContentsOfFile:configPath options:0 error:error];
    if (!data) return nil;
    NSDictionary *root = [NSJSONSerialization JSONObjectWithData:data options:0 error:error];
    if (![root isKindOfClass:NSDictionary.class]) return nil;
    self.config = root;

    NSInteger port = [root[@"port"] integerValue] ?: 48777;
    self.endpoint = [NSURL URLWithString:[NSString stringWithFormat:@"http://127.0.0.1:%ld/action", (long)port]];
    NSURL *logs = [NSFileManager.defaultManager.homeDirectoryForCurrentUser
                   URLByAppendingPathComponent:@"Library/Logs/PremiereMacroBridge" isDirectory:YES];
    [NSFileManager.defaultManager createDirectoryAtURL:logs withIntermediateDirectories:YES attributes:nil error:nil];
    self.logURL = [logs URLByAppendingPathComponent:@"hotkeys.log"];

    EventTypeSpec eventType = {kEventClassKeyboard, kEventHotKeyPressed};
    OSStatus handlerStatus = InstallEventHandler(GetApplicationEventTarget(), PMBHotkeyHandler, 1,
                                                  &eventType, (__bridge void *)self, NULL);
    if (handlerStatus != noErr) {
        if (error) *error = [NSError errorWithDomain:@"PremiereMacroBridge" code:handlerStatus
                                            userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"InstallEventHandler failed: %d", handlerStatus]}];
        return nil;
    }

    NSArray *hotkeys = root[@"hotkeys"];
    if (![hotkeys isKindOfClass:NSArray.class] || hotkeys.count == 0) {
        if (error) *error = [NSError errorWithDomain:@"PremiereMacroBridge" code:3
                                            userInfo:@{NSLocalizedDescriptionKey: @"no hotkeys in config"}];
        return nil;
    }

    NSMutableDictionary *actions = [NSMutableDictionary dictionary];
    OSType signature = 'PMBH';
    UInt32 numericID = 1;
    for (NSDictionary *spec in hotkeys) {
        NSString *key = spec[@"key"];
        NSString *action = spec[@"action"];
        NSString *actionID = spec[@"id"];
        UInt32 keyCode = PMBKeyCode(key ?: @"");
        if (!action.length || !actionID.length || keyCode == UINT32_MAX) {
            if (error) *error = [NSError errorWithDomain:@"PremiereMacroBridge" code:4
                                                userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"invalid hotkey entry: %@", spec]}];
            return nil;
        }
        EventHotKeyID hotkeyID = {signature, numericID};
        EventHotKeyRef hotkeyRef = NULL;
        OSStatus registerStatus = RegisterEventHotKey(keyCode, PMBModifiers(spec[@"modifiers"] ?: @[]),
                                                      hotkeyID, GetApplicationEventTarget(), 0, &hotkeyRef);
        if (registerStatus != noErr) {
            if (error) *error = [NSError errorWithDomain:@"PremiereMacroBridge" code:registerStatus
                                                userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"RegisterEventHotKey %@ failed: %d", key, registerStatus]}];
            return nil;
        }
        actions[@(numericID)] = @{ @"action": action, @"id": actionID };
        [self log:[NSString stringWithFormat:@"HOTKEY_REGISTERED control+option+%@ -> %@:%@", key, action, actionID]];
        numericID++;
    }
    self.actions = actions;
    return self;
}

- (void)postPayload:(NSDictionary *)payload completion:(void (^)(NSInteger, NSDictionary *, NSString *, NSError *))completion {
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:self.endpoint];
    request.HTTPMethod = @"POST";
    request.timeoutInterval = 10;
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    request.HTTPBody = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    [[NSURLSession.sharedSession dataTaskWithRequest:request
                                  completionHandler:^(NSData *data, NSURLResponse *response, NSError *requestError) {
        NSInteger status = [(NSHTTPURLResponse *)response statusCode];
        NSString *body = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"";
        NSDictionary *json = nil;
        if (data) json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if (completion) completion(status, json, body ?: @"", requestError);
    }] resume];
}

- (void)fire:(UInt32)numericID {
    NSDictionary *mapped = self.actions[@(numericID)];
    if (!mapped) return;
    [self log:[NSString stringWithFormat:@"HOTKEY_FIRED %@:%@", mapped[@"action"], mapped[@"id"]]];
    NSDictionary *payload = @{ @"action": mapped[@"action"], @"id": mapped[@"id"] };
    [self postPayload:payload completion:^(NSInteger status, NSDictionary *json, NSString *body, NSError *requestError) {
        if (requestError) {
            [self log:[NSString stringWithFormat:@"BRIDGE_ERROR %@", requestError.localizedDescription]];
            return;
        }
        [self log:[NSString stringWithFormat:@"BRIDGE_RESPONSE status=%ld %@", (long)status, body ?: @""]];
    }];
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
        NSUInteger flag = [arguments indexOfObject:@"--config"];
        if (flag == NSNotFound || flag + 1 >= arguments.count) {
            fprintf(stderr, "usage: premiere-macro-hotkeys --config /absolute/path/config.json\n");
            return 64;
        }
        NSError *error = nil;
        PMBHotkeyBridge *bridge = [[PMBHotkeyBridge alloc] initWithConfigPath:arguments[flag + 1] error:&error];
        if (!bridge) {
            fprintf(stderr, "BRIDGE_ERROR %s\n", error.localizedDescription.UTF8String);
            return 1;
        }
        NSApplication *application = [NSApplication sharedApplication];
        [application setActivationPolicy:NSApplicationActivationPolicyAccessory];
        [application run];
        (void)bridge;
    }
    return 0;
}
