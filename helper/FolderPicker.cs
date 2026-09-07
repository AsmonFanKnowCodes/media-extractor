using System;
using System.Text;
using System.Windows.Forms;
class FolderPicker {
  [STAThread] static int Main(string[] args) {
    try {
      Console.OutputEncoding = new UTF8Encoding(false);
      Application.EnableVisualStyles();
      using(var owner=new Form {TopMost=true,ShowInTaskbar=false,Opacity=0,Width=1,Height=1,StartPosition=FormStartPosition.CenterScreen})
      using(var picker=new FolderBrowserDialog {Description="Choose where to save YouTube videos",ShowNewFolderButton=true}) {
        if(args.Length>0) picker.SelectedPath=args[0];
        owner.Show();
        if(picker.ShowDialog(owner)==DialogResult.OK) Console.Write(picker.SelectedPath);
      }
      return 0;
    } catch(Exception error) {Console.Error.WriteLine(error.Message);return 1;}
  }
}
