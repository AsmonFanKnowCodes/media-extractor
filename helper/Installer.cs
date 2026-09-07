using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;

class BrowserOption {
  public string Name, Executable, Address;
  public override string ToString() { return Name + (Executable == null ? " (not detected)" : ""); }
}
class Installer {
  static Color Blue=Color.FromArgb(0,113,227);
  static Button Button(string text,int x,int y,int width) {
    var button=new Button {Text=text,Left=x,Top=y,Width=width,Height=44,FlatStyle=FlatStyle.Flat,BackColor=Blue,ForeColor=Color.White,Cursor=Cursors.Hand};
    button.FlatAppearance.BorderSize=0;
    var shape=new GraphicsPath();shape.AddArc(0,0,44,44,90,180);shape.AddArc(width-44,0,44,44,270,180);shape.CloseFigure();button.Region=new Region(shape);shape.Dispose();
    return button;
  }
  static string FindBrowser(string executable,params string[] candidates) {
    foreach(string root in new[]{"HKEY_CURRENT_USER","HKEY_LOCAL_MACHINE"}) {
      var value=Microsoft.Win32.Registry.GetValue(root+@"\Software\Microsoft\Windows\CurrentVersion\App Paths\"+executable,"",null) as string;
      if(value!=null && File.Exists(value))return value;
    }
    foreach(string candidate in candidates) if(File.Exists(candidate))return candidate;
    return null;
  }
  [STAThread] static void Main(string[] args) {
    Application.EnableVisualStyles();
    string appData=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    string programFiles=Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
    string programFilesX86=Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
    string installedExtension=Path.Combine(appData,"MediaExtractor","extension");
    var form=new Form {Text="Media Extractor Setup",ClientSize=new Size(550,445),BackColor=Color.White,Font=new Font("Segoe UI",10),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,StartPosition=FormStartPosition.CenterScreen};
    var heading=new Label {Text="Set up Media Extractor",Left=26,Top=24,Width=500,Height=38,Font=new Font("Segoe UI",19)};
    var description=new Label {Text="Download videos and photos from your browser.\nSetup handles the required components automatically.",Left=28,Top=76,Width=495,Height=52,ForeColor=Color.FromArgb(80,80,85)};
    var browserLabel=new Label {Text="Which browser will you use?",Left=28,Top=150,Width=470,Height=24};
    var browsers=new ComboBox {Left=28,Top=180,Width=490,DropDownStyle=ComboBoxStyle.DropDownList};
    browsers.DrawMode=DrawMode.OwnerDrawFixed;browsers.ItemHeight=24;
    browsers.DrawItem+=(sender,e)=>{e.DrawBackground();if(e.Index>=0){using(var brush=new SolidBrush(Color.FromArgb(29,29,31)))e.Graphics.DrawString(browsers.Items[e.Index].ToString(),form.Font,brush,e.Bounds.X+6,e.Bounds.Y+3);}e.DrawFocusRectangle();};
    browsers.Items.Add(new BrowserOption {Name="Google Chrome",Address="chrome://extensions",Executable=FindBrowser("chrome.exe",Path.Combine(programFiles,@"Google\Chrome\Application\chrome.exe"),Path.Combine(programFilesX86,@"Google\Chrome\Application\chrome.exe"),Path.Combine(appData,@"Google\Chrome\Application\chrome.exe"))});
    browsers.Items.Add(new BrowserOption {Name="Microsoft Edge",Address="edge://extensions",Executable=FindBrowser("msedge.exe",Path.Combine(programFilesX86,@"Microsoft\Edge\Application\msedge.exe"),Path.Combine(programFiles,@"Microsoft\Edge\Application\msedge.exe"))});
    browsers.Items.Add(new BrowserOption {Name="Brave",Address="brave://extensions",Executable=FindBrowser("brave.exe",Path.Combine(programFiles,@"BraveSoftware\Brave-Browser\Application\brave.exe"),Path.Combine(programFilesX86,@"BraveSoftware\Brave-Browser\Application\brave.exe"),Path.Combine(appData,@"BraveSoftware\Brave-Browser\Application\brave.exe"))});
    browsers.SelectedIndex=0;
    for(int i=0;i<browsers.Items.Count;i++) if(((BrowserOption)browsers.Items[i]).Executable!=null){browsers.SelectedIndex=i;break;}
    var explanation=new Label {Text="For Windows 10/11, 64-bit. Installs for your Windows account.\nNo administrator access or separate Node.js setup needed.\nFinish downloads and close browsers using Media Extractor first.",Left=28,Top=229,Width=495,Height=75,ForeColor=Color.FromArgb(90,90,95)};
    var progress=new ProgressBar {Left=28,Top=318,Width=490,Height=8,Visible=false,Maximum=100};
    var status=new Label {Left=28,Top=277,Width=490,Height=37,Visible=false,ForeColor=Color.FromArgb(80,80,85)};
    var install=Button("Install",348,365,170);
    var close=new Button {Text="Cancel",Left=225,Top=365,Width=110,Height=44,FlatStyle=FlatStyle.Flat,BackColor=Color.White,ForeColor=Blue};close.FlatAppearance.BorderSize=0;
    var copyPath=Button("Copy extension folder",28,305,235);copyPath.Visible=false;
    var openBrowser=Button("Open browser extensions",283,305,235);openBrowser.Visible=false;
    var folder=new LinkLabel {Text="Show installed folder",Left=28,Top=368,Width=180,Height=26,Visible=false,LinkColor=Blue};
    var pathBox=new TextBox {Left=28,Top=244,Width=490,Height=30,ReadOnly=true,Text=installedExtension,Visible=false};
    form.Controls.AddRange(new Control[]{heading,description,browserLabel,browsers,explanation,progress,status,install,close,copyPath,openBrowser,folder,pathBox});
    bool busy=false;
    close.Click+=(sender,e)=>form.Close();
    form.FormClosing+=(sender,e)=>{if(busy)e.Cancel=true;};
    copyPath.Click+=(sender,e)=>{Clipboard.SetText(installedExtension);copyPath.Text="Copied";};
    folder.LinkClicked+=(sender,e)=>Process.Start(new ProcessStartInfo("explorer.exe","\""+installedExtension+"\""){UseShellExecute=true});
    openBrowser.Click+=(sender,e)=> {
      var browser=(BrowserOption)browsers.SelectedItem;
      if(browser.Executable==null){MessageBox.Show(form,"Open "+browser.Name+" and enter "+browser.Address+" in its address bar.","Open Extensions");return;}
      Process.Start(new ProcessStartInfo(browser.Executable,browser.Address){UseShellExecute=true});
    };
    install.Click+=async(sender,e)=> {
      busy=true;install.Enabled=false;close.Enabled=false;browsers.Enabled=false;explanation.Visible=false;progress.Visible=true;status.Visible=true;progress.Value=5;status.Text="Preparing setup…";
      string error=null;
      await Task.Run(()=> {
        try {
          string scratch=Path.Combine(appData,"MediaExtractor","setup-temp",Guid.NewGuid().ToString("N"));
          Directory.CreateDirectory(scratch);
          string archive=Path.Combine(scratch,"payload.zip");
          using(var source=Assembly.GetExecutingAssembly().GetManifestResourceStream("MediaExtractor.Payload.zip"))
          using(var output=File.Create(archive)) {if(source==null)throw new Exception("Installer package is missing.");source.CopyTo(output);}
          string payload=Path.Combine(scratch,"payload");ZipFile.ExtractToDirectory(archive,payload);
          string script=Path.Combine(payload,"helper","install.ps1");
          var start=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File \""+script+"\" -RefreshTools") {UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
          using(var process=new Process {StartInfo=start}) {
            process.OutputDataReceived+=(owner,line)=> {
              if(line.Data==null)return;
              if(line.Data.StartsWith("PROGRESS|")) {
                var parts=line.Data.Split(new[]{'|'},3);int value;
                if(parts.Length==3 && int.TryParse(parts[1],out value))form.BeginInvoke((Action)(()=>{progress.Value=Math.Max(0,Math.Min(100,value));status.Text=parts[2];}));
              }
            };
            process.Start();process.BeginOutputReadLine();var stderr=process.StandardError.ReadToEndAsync();process.WaitForExit();
            if(process.ExitCode!=0) error=stderr.Result;
          }
          // Scratch contains only this installer instance's generated payload.
          string expected=Path.Combine(appData,"MediaExtractor","setup-temp")+Path.DirectorySeparatorChar;
          if(Path.GetFullPath(scratch).StartsWith(expected,StringComparison.OrdinalIgnoreCase)) {try{Directory.Delete(scratch,true);}catch{}}
        }catch(Exception ex){error=ex.Message;}
      });
      busy=false;close.Enabled=true;
      if(error!=null) {
        install.Enabled=true;install.Text="Retry";browsers.Enabled=true;status.Text="Setup could not finish. Your downloads were not removed.";
        MessageBox.Show(form,error.Length>2200?error.Substring(0,2200):error,"Setup needs attention",MessageBoxButtons.OK,MessageBoxIcon.Error);return;
      }
      heading.Text="One browser step left";
      description.Text="The app and its components are installed.\nAdd the extension below, then it starts automatically.";
      browserLabel.Text="In "+((BrowserOption)browsers.SelectedItem).Name+": enable Developer mode → Load unpacked.";
      browserLabel.Height=44;browserLabel.Top=146;browsers.Visible=false;
      explanation.Text="Select this folder when the browser asks:";explanation.Top=209;explanation.Height=26;explanation.Visible=true;
      progress.Visible=false;status.Visible=false;install.Visible=false;close.Text="Done";close.Left=408;
      copyPath.Visible=true;openBrowser.Visible=true;folder.Visible=true;pathBox.Visible=true;
    };
    if(args.Length==2 && args[0]=="--render") {form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-32000,-32000);form.Show();Application.DoEvents();using(var image=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(image,new Rectangle(0,0,form.Width,form.Height));image.Save(args[1]);}form.Close();form.Dispose();return;}
    Application.Run(form);
  }
}
