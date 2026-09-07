using System;
using System.IO;
class FixtureGallery {
 static int Main(string[] args) {
  string folder=args[Array.IndexOf(args,"--directory")+1];
  Directory.CreateDirectory(folder);
  string url=args[args.Length-1];
  if(url.Contains("EMPTY")) return 0;
  File.WriteAllText(Path.Combine(folder,"photo-1.jpg"),"photo fixture");
  if(url.Contains("PARTIAL")) {Console.Error.WriteLine("ERROR: One image unavailable.");return 1;}
  File.WriteAllText(Path.Combine(folder,"photo-2.png"),"photo fixture");
  Console.WriteLine("Saved two photos");return 0;
 }
}
