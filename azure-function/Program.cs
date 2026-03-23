using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        services.AddApplicationInsightsTelemetryWorkerService();
        services.ConfigureFunctionsApplicationInsights();

        // HttpClient für den Zugriff auf das externe Archivsystem
        services.AddHttpClient("ArchiveApi", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(30);
        });
    })
    .Build();

host.Run();
