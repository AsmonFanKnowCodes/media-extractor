using System;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
class FixtureDownloader {
  static int Main(string[] args) {
    var json=new JavaScriptSerializer();
    string output=args[Array.IndexOf(args,"-P")+1];
    File.WriteAllText(Path.Combine(output,"fixture-args.json"),json.Serialize(args));
    if(args[args.Length-1].EndsWith("aaaaaaaaaaa")) {Console.Error.WriteLine("ERROR: Video unavailable.");return 1;}
    Console.WriteLine("ME_PROGRESS 25.0%");
    Thread.Sleep(1800);
    string filename=Path.Combine(output,"Native YouTube fixture with audio.mp4");
    File.WriteAllText(filename,"Fixture video and audio");
    Console.WriteLine("ME_PROGRESS 100.0%");
    Console.WriteLine("ME_FILE "+json.Serialize(filename));
    return 0;
  }
}
