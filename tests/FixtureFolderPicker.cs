using System;
using System.IO;
using System.Text;
class FixtureFolderPicker {
 static int Main(string[] args) {
  Console.OutputEncoding=new UTF8Encoding(false);
  string parent=Path.GetDirectoryName(args[0]);
  if(File.Exists(Path.Combine(parent,"cancel-picker"))) return 0;
  Console.Write(Path.Combine(parent,"picked videos"));
  return 0;
 }
}
