<?php
// Wendy may publish only slugs named in allowlist.json.
// The filename comes from that file. The request body cannot choose a path.

header("Content-Type: application/json");

$allow = json_decode(file_get_contents(__DIR__ . "/allowlist.json"), true);
if (!is_array($allow)) {
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "allowlist missing"]);
    exit;
}

$raw = file_get_contents("php://input");
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "json body required"]);
    exit;
}

$expected = getenv("PUBLISH_TOKEN") ?: "";
$given = isset($body["token"]) ? (string) $body["token"] : "";
if ($expected === "" || !hash_equals($expected, $given)) {
    http_response_code(401);
    echo json_encode(["ok" => false, "error" => "unauthorized"]);
    exit;
}

$slug = isset($body["slug"]) ? (string) $body["slug"] : "";
if (!preg_match('/^[a-z0-9-]{1,40}$/', $slug) || !isset($allow[$slug])) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "slug is not allowlisted"]);
    exit;
}

$filename = $allow[$slug];
if (!is_string($filename) || $filename !== basename($filename) || str_contains($filename, "..")) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "slug is not allowlisted"]);
    exit;
}

$root = realpath(__DIR__ . "/pages");
$dest = $root . DIRECTORY_SEPARATOR . $filename;
if ($root === false || dirname($dest) !== $root) {
    http_response_code(400);
    echo json_encode(["ok" => false, "error" => "path refused"]);
    exit;
}

$title = substr((string) ($body["title"] ?? ""), 0, 200);
$page = substr((string) ($body["body"] ?? ""), 0, 20000);
$html = "<!doctype html><html><head><meta charset=\"utf-8\"><title>"
    . htmlspecialchars($title, ENT_QUOTES)
    . "</title></head><body><h1>"
    . htmlspecialchars($title, ENT_QUOTES)
    . "</h1><article>"
    . nl2br(htmlspecialchars($page, ENT_QUOTES))
    . "</article></body></html>\n";

if (file_put_contents($dest, $html) === false) {
    http_response_code(500);
    echo json_encode(["ok" => false, "error" => "write failed"]);
    exit;
}

echo json_encode(["ok" => true, "path" => "pages/" . $filename]);
