<?php
$target = "https://dayz-shop.onrender.com/api/freekassa/notify";
$method = $_SERVER["REQUEST_METHOD"] ?? "POST";
$query = $_SERVER["QUERY_STRING"] ?? "";
$url = $target . ($query ? "?" . $query : "");

$body = file_get_contents("php://input");
if ($body === "" && !empty($_POST)) {
    $body = http_build_query($_POST);
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 20);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: application/x-www-form-urlencoded"]);

if ($method !== "GET" && $method !== "HEAD") {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

header("Content-Type: text/plain; charset=utf-8");

if ($response === false) {
    http_response_code(502);
    echo "Proxy error: " . $error;
    exit;
}

if ($status >= 400) {
    http_response_code($status);
}

echo $response;
