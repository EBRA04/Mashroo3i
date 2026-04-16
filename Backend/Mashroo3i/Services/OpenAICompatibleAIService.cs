// Services/AI/OpenAICompatibleAIService.cs
using Mashroo3i.Configuration;
using Mashroo3i.Services.AI;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Mashroo3i.Services
{
    // This class is the ONLY place in the entire app that knows how to talk to an AI API.
    // It works with any provider that follows the OpenAI format (Groq, DeepSeek, OpenAI, Mistral).
    // Your services never use this class directly — they use IAIService (the interface/promise).
    public class OpenAICompatibleAIService : IAIService
    {
        private readonly HttpClient _http;           // the thing that makes HTTP calls to the AI API
        private readonly ProviderSettings _settings; // holds ApiKey, Model, BaseUrl for the active provider
        private readonly string _completionsUrl;     // the full URL we POST to — built once in the constructor
        private readonly ILogger<OpenAICompatibleAIService> _logger; // for logging errors and info

        public string ProviderName { get; } // e.g. "Groq", "DeepSeek" — used in log messages

        // Constructor — runs once when the app starts.
        // ASP.NET automatically passes in everything this class needs (from Program.cs registrations).
        public OpenAICompatibleAIService(
            IHttpClientFactory httpClientFactory, // factory that creates HttpClient instances safely
            ProviderSettings settings,            // the active provider's ApiKey, Model, BaseUrl
            string providerName,                  // the name of the active provider e.g. "Groq"
            ILogger<OpenAICompatibleAIService> logger)
        {
            _settings = settings;
            ProviderName = providerName;
            _logger = logger;

            // Build the full API URL once here and reuse it forever.
            // Why not use HttpClient.BaseAddress + relative path?
            // Because .NET has a bug: if BaseAddress has a sub-path like "https://api.groq.com/openai/v1"
            // and you call PostAsync("v1/chat/completions"), .NET silently drops "openai" from the path
            // and hits the wrong URL. Building it manually here avoids that entirely.
            var baseUrl = _settings.BaseUrl.TrimEnd('/'); // remove trailing slash if any

            // Some providers (Groq) already include /v1 in their BaseUrl, others (DeepSeek) don't.
            // This check makes sure we never end up with a doubled /v1/v1 in the URL.
            _completionsUrl = baseUrl.EndsWith("/v1")
                ? baseUrl + "/chat/completions"       // Groq:    https://api.groq.com/openai/v1/chat/completions
                : baseUrl + "/v1/chat/completions";   // DeepSeek: https://api.deepseek.com/v1/chat/completions

            _http = httpClientFactory.CreateClient();

            // Set the Authorization header once here — every request will include it automatically.
            // All OpenAI-compatible APIs use "Bearer YOUR_API_KEY" for authentication.
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _settings.ApiKey);
        }

        // Use this when you want a plain text response from the AI (summaries, analysis, descriptions).
        // Returns the AI's response as a raw string — your service receives it and returns it directly.
        public async Task<string> GenerateTextAsync(string prompt, CancellationToken ct = default)
        {
            // Build the request body in the format all OpenAI-compatible APIs expect.
            // "model" tells the API which AI model to use (from your appsettings).
            // "messages" is the conversation — we always send a single user message (the prompt).
            // "temperature" controls creativity: 0 = very precise, 1 = very creative. 0.7 is a good balance.
            var requestBody = new
            {
                model = _settings.Model,
                messages = new[]
                {
                    new { role = "user", content = prompt }
                },
                temperature = 0.7
            };

            // Serialize the request body to JSON and wrap it in an HTTP content object.
            // "application/json" tells the API what format we're sending.
            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            // Log what we're about to do — useful for debugging and monitoring.
            _logger.LogInformation("[{Provider}] POST {Url} | {Length} chars",
                ProviderName, _completionsUrl, prompt.Length);

            // Send the POST request to the AI API.
            // Wrapped in try/catch to give a clear error if the connection itself fails
            // (e.g. no internet, wrong URL, API is down).
            HttpResponseMessage response;
            try
            {
                response = await _http.PostAsync(_completionsUrl, content, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[{Provider}] Connection failed to {Url}", ProviderName, _completionsUrl);
                throw new HttpRequestException(
                    $"{ProviderName}: connection failed — {ex.GetType().Name}: {ex.Message}", ex);
            }

            // Check if the API returned an error status (4xx = bad request, 5xx = server error).
            // This covers things like wrong API key, exceeded quota, invalid model name.
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(ct);
                _logger.LogError("[{Provider}] HTTP {Status}: {Body}", ProviderName, (int)response.StatusCode, errorBody);
                throw new HttpRequestException(
                    $"{ProviderName} returned HTTP {(int)response.StatusCode}: {errorBody}");
            }

            // Parse the JSON response from the AI API.
            // All OpenAI-compatible APIs return the same structure:
            // { "choices": [ { "message": { "content": "the AI's reply here" } } ] }
            var responseJson = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(responseJson);

            // Navigate to choices[0].message.content to get the actual text reply.
            var text = doc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            return text ?? string.Empty; // never return null — return empty string if something went wrong
        }

        // Use this when you want the AI to return structured data that maps to a C# class.
        // T is the type you want back e.g. GenerateJsonAsync<MarketAnalysis>(prompt)
        // Internally it calls GenerateTextAsync — it just adds JSON instructions and deserializes the result.
        public async Task<T> GenerateJsonAsync<T>(string prompt, CancellationToken ct = default) where T : class
        {
            // Append a strict instruction to the prompt telling the AI to return only raw JSON.
            // Without this, models often wrap their response in ```json ... ``` markdown blocks
            // or add explanatory text before/after the JSON — both break deserialization.
            var jsonPrompt =
                prompt +
                "\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no code blocks, no explanation. Just the raw JSON object.";

            // Get the raw text response using the method above.
            var raw = await GenerateTextAsync(jsonPrompt, ct);

            // Even with the instruction above, some models still wrap the JSON in ``` fences.
            // This block detects and strips them so we get clean JSON to deserialize.
            var cleaned = raw.Trim();
            if (cleaned.StartsWith("```"))
            {
                var firstNewline = cleaned.IndexOf('\n');   // end of the opening ```json line
                var lastFence = cleaned.LastIndexOf("```"); // start of the closing ``` line
                if (firstNewline >= 0 && lastFence > firstNewline)
                    cleaned = cleaned[(firstNewline + 1)..lastFence].Trim(); // extract just the JSON between the fences
            }

            // Deserialize the cleaned JSON string into your C# class.
            // PropertyNameCaseInsensitive: true means "market_size" in JSON maps to "MarketSize" in C# — no need to match casing exactly.
            // WhenWritingNull means null properties are simply skipped instead of written as "property": null.
            try
            {
                var result = JsonSerializer.Deserialize<T>(cleaned, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
                });

                return result ?? throw new JsonException("Deserialization returned null");
            }
            catch (JsonException ex)
            {
                // If the AI returned something that isn't valid JSON, log the first 300 chars
                // so you can see what the model actually returned and fix your prompt.
                _logger.LogError(ex, "[{Provider}] Bad JSON: {Raw}", ProviderName, cleaned);
                throw new InvalidOperationException(
                    $"{ProviderName} returned invalid JSON: {cleaned[..Math.Min(300, cleaned.Length)]}", ex);
            }
        }
    }
}