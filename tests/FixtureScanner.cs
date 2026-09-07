using System;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;
class FixtureScanner {
 static int Main(string[] args) {
  var json=new JavaScriptSerializer();string url=args[args.Length-1];
  bool empty=url.Contains("FAIL")||url.Contains("OPEN");
  if(Array.IndexOf(args,"--dump-json")>=0) {
   if(empty){Console.WriteLine("[[-1,{\"message\":\"Login required for remote photos\"}]]");return 0;}
   Console.WriteLine(json.Serialize(new object[]{new object[]{3,"https://scontent.cdninstagram.com/fixture-photo-1.png",new {extension="png",width=1080,height=1350}},new object[]{3,"https://scontent.cdninstagram.com/fixture-photo-2.png",new {extension="png",width=1080,height=1350}}}));return 0;
  }
  if(Array.IndexOf(args,"--dump-single-json")>=0) {
   if(empty){Console.WriteLine("{\"entries\":[]}");Console.Error.WriteLine("ERROR: No video metadata available");return 0;}
   Console.WriteLine(json.Serialize(new {id="fixture",title="Video fixture",webpage_url=url,extractor="test",formats=new[]{new {format_id="1080",url="https://scontent.cdninstagram.com/fixture-video.mp4",width=1080,height=1920,vcodec="h264",acodec="aac",protocol="https",tbr=4000}}}));return 0;
  }
  int infoIndex=Array.IndexOf(args,"--load-info-json");
  if(infoIndex>=0) {
   string output=args[Array.IndexOf(args,"-P")+1];Directory.CreateDirectory(output);
   string file=Path.Combine(output,"Selected video.mp4");File.WriteAllText(file,"fixture video");
   Console.WriteLine("ME_FILE "+json.Serialize(file));return 0;
  }
  return 1;
 }
}
