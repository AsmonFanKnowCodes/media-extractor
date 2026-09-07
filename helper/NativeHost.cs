using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

class NativeHost {
  static void Pump(Stream input, Stream output) {
    var buffer = new byte[8192];
    int count;
    while ((count = input.Read(buffer, 0, buffer.Length)) > 0) {
      output.Write(buffer, 0, count);
      output.Flush();
    }
  }
  static int Main(string[] args) {
    try {
      string root = AppDomain.CurrentDomain.BaseDirectory;
      string origin = args.Length > 0 ? args[0] : "";
      if (!System.Text.RegularExpressions.Regex.IsMatch(origin, "^chrome-extension://[a-p]{32}/$")) return 2;
      var info = new ProcessStartInfo(Path.Combine(root, "node.exe"), "\"" + Path.Combine(root, "helper", "native.mjs") + "\" " + origin);
      info.UseShellExecute = false;
      info.CreateNoWindow = true;
      info.WindowStyle = ProcessWindowStyle.Hidden;
      info.RedirectStandardInput = true;
      info.RedirectStandardOutput = true;
      info.RedirectStandardError = true;
      using (var child = Process.Start(info)) {
        Task.Run(() => { try { Pump(Console.OpenStandardInput(), child.StandardInput.BaseStream); } catch {} finally { try { child.StandardInput.Close(); } catch {} } });
        Task.Run(() => { try { Pump(child.StandardError.BaseStream, Console.OpenStandardError()); } catch {} });
        Pump(child.StandardOutput.BaseStream, Console.OpenStandardOutput());
        child.WaitForExit();
        return child.ExitCode;
      }
    } catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
  }
}
