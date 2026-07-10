<?php
// PHP implementation of server.cjs SSE Endpoint

// 1. execution time limit को असीमित (infinite) करें ताकि कनेक्शन बीच में बंद न हो
set_time_limit(0);

// default timezone सेट करें (जरूरत अनुसार)
date_default_timezone_set('Asia/Kolkata');

// 2. Event-Stream headers भेजें
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('Access-Control-Allow-Origin: *');
header('X-Accel-Buffering: no'); // Nginx/Reverse Proxy के लिए buffering डिसेबल करने हेतु

// 3. PHP की internal output buffering को बंद करें ताकि डेटा तुरंत सेंड हो
while (ob_get_level() > 0) {
    ob_end_clean();
}
ob_implicit_flush(true);

// 4. state query parameter को गेट करें
$state = isset($_GET['state']) ? $_GET['state'] : 'up';
$filePath = __DIR__ . "/sample-{$state}.json";

$currentData = null;
$updateCount = 0;
$modifiedIndices = [];

// JSON फ़ाइल से शुरुआती डेटा लोड करें
if (file_exists($filePath)) {
    $jsonContent = file_get_contents($filePath);
    $currentData = json_decode($jsonContent, true); // true: associative array में पार्स करने के लिए
} else {
    error_log("Error reading data file for state {$state}: File not found at {$filePath}");
}

// BJP कैंडिडेट्स को शुरुआत में SP में बदलें (BJP काउंट को मेजॉरिटी से नीचे रखने के लिए)
if ($state !== 'goa' && $currentData && isset($currentData['data']) && is_array($currentData['data'])) {
    $changedCount = 0;
    foreach ($currentData['data'] as $idx => &$candidate) {
        if (isset($candidate['party']) && $candidate['party'] === 'BJP' && $changedCount < 10) {
            $candidate['party'] = 'SP';
            $modifiedIndices[] = $idx;
            $changedCount++;
        }
    }
    unset($candidate); // reference break करें
}

// SSE format में डेटा भेजने का फ़ंक्शन
function sendSSE($data) {
    echo "data: " . json_encode($data) . "\n\n";
    ob_flush();
    flush();
}

// 5. शुरुआती डेटा तुरंत भेजें
if ($currentData) {
    sendSSE($currentData);
}

// 6. सिमुलेशन लूप (हर 5 सेकंड में अपडेट्स भेजेगा)
while (true) {
    // अगर यूजर/क्लाइंट ने कनेक्शन क्लोज़ कर दिया है, तो लूप से बाहर निकलें
    if (connection_aborted()) {
        break;
    }

    if ($currentData) {
        // Goa के लिए स्टेटिक/Hung Assembly रखें (सिर्फ keepalive भेजें)
        if ($state === 'goa') {
            echo ": keepalive\n\n";
            ob_flush();
            flush();
        } else {
            $updateCount++;
            $hasChanges = false;

            // धीरे-धीरे BJP कैंडिडेट्स को रिस्टोर करें ताकि BJP मेजॉरिटी क्रॉस करे
            if (count($modifiedIndices) > 0 && $updateCount <= 5) {
                $restoreCount = 2;
                for ($i = 0; $i < $restoreCount; $i++) {
                    if (count($modifiedIndices) > 0) {
                        $idx = array_pop($modifiedIndices);
                        if (isset($currentData['data'][$idx])) {
                            $currentData['data'][$idx]['party'] = 'BJP';
                            $currentData['data'][$idx]['status'] = 'leading'; // double-blink gold animation
                            $hasChanges = true;
                        }
                    }
                }
            }

            // रैंडम बदलाव/फ्लक्चुएशन का लॉजिक (5% चांस प्रति कैंडिडेट)
            if (isset($currentData['data']) && is_array($currentData['data']) && count($currentData['data']) > 0) {
                $parties = [];
                if (isset($currentData['parties']) && is_array($currentData['parties'])) {
                    foreach ($currentData['parties'] as $p) {
                        $parties[] = $p['name'];
                    }
                } elseif (isset($currentData['colors'])) {
                    $parties = array_filter(array_keys($currentData['colors']), function($p) {
                        return $p !== 'DEFAULT';
                    });
                    $parties = array_values($parties);
                }

                if (count($parties) > 1) {
                    foreach ($currentData['data'] as $idx => &$candidate) {
                        // जो कैंडिडेट्स रिस्टोर हो रहे हैं, उनमें रैंडम फ्लक्चुएशन न हो
                        if (in_array($idx, $modifiedIndices)) {
                            continue;
                        }

                        // 5% चांस अपडेट करने का
                        if ((mt_rand() / mt_getrandmax()) < 0.05) {
                            if (isset($candidate['status']) && $candidate['status'] === 'leading') {
                                // 20% चांस कैंडिडेट के जीतने का
                                if ((mt_rand() / mt_getrandmax()) < 0.2) {
                                    $candidate['status'] = 'won';
                                    $hasChanges = true;
                                } else {
                                    // 80% चांस लीड फ्लक्चुएट होने का
                                    $currentPartyIdx = array_search($candidate['party'], $parties);
                                    if ($currentPartyIdx !== false) {
                                        $nextPartyIdx = ($currentPartyIdx + mt_rand(1, count($parties) - 1)) % count($parties);
                                        $candidate['party'] = $parties[$nextPartyIdx];
                                        $hasChanges = true;
                                    }
                                }
                            }
                        }
                    }
                    unset($candidate); // reference break करें
                }
            }

            if ($hasChanges) {
                sendSSE($currentData);
            } else {
                echo ": keepalive\n\n";
                ob_flush();
                flush();
            }
        }
    } else {
        echo ": keepalive\n\n";
        ob_flush();
        flush();
    }

    // 5 सेकंड का वेट
    sleep(5);
}
