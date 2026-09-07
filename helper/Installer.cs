using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

class Installer {
  [STAThread] static void Main() {
    Application.EnableVisualStyles();
    var form = new Form { Text="YouTube Video Downloader Setup", Width=460, Height=160, FormBorderStyle=FormBorderStyle.FixedDialog, MaximizeBox=false, MinimizeBox=false, StartPosition=FormStartPosition.CenterScreen };
    form.Controls.Add(new Label { Text="Installing the background downloader…\nThis window will close when setup finishes.", Left=22, Top=18, Width=410, Height=45 });
    form.Controls.Add(new ProgressBar { Left=22, Top=75, Width=395, Style=ProgressBarStyle.Marquee });
    bool busy=true;
    form.FormClosing += (sender, e) => { if(busy) e.Cancel=true; };
    form.Shown += async (sender,e) => {
      string error=null;
      await Task.Run(() => {
        try {
          string script=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"helper","install.ps1");
          var info=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File \""+script+"\"") { UseShellExecute=false, CreateNoWindow=true, RedirectStandardError=true, RedirectStandardOutput=true };
          using(var process=Process.Start(info)) {
            var stdout=process.StandardOutput.ReadToEndAsync();
            var stderr=process.StandardError.ReadToEndAsync();
            process.WaitForExit();
            if(process.ExitCode!=0) error=stderr.Result+"\n"+stdout.Result;
          }
        } catch(Exception ex) { error=ex.Message; }
      });
      busy=false;
      MessageBox.Show(form,error ?? "Installed. Reload YouTube Video Downloader in your browser's Extensions page, then reopen it. The downloader will start automatically.",error==null?"Setup complete":"Setup could not finish",MessageBoxButtons.OK,error==null?MessageBoxIcon.Information:MessageBoxIcon.Error);
      form.Close();
    };
    Application.Run(form);
  }
}
