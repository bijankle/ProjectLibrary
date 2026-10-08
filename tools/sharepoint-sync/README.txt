PROJECT LIBRARY: SHAREPOINT SYNC

One time setup
 1. In SharePoint, open KCGM Controlled Library and click Sync. The library appears in File Explorer under your
    company name. Right click the "3 Documents" folder (or the whole library) and pick "Always keep on this device"
    if you want the script to work without waiting for downloads.
 2. Make a GitHub key: github.com > Settings > Developer settings > Fine-grained tokens > Generate.
    Repository access: only bijankle/ProjectLibrary. Permissions: Contents, Read and write. Copy the key.
 3. Put these three files in one folder on your PC. Double-click "Sync Project Library.bat".
    It asks for the synced folder and the key the first time only.

Every time
 Double-click "Sync Project Library.bat". It uploads any watched document whose revision is newer than the last one it
 sent. To add documents, add their numbers to watch-list.txt (one per line, * allowed).

Run it automatically
 Task Scheduler > Create Basic Task > Daily > Start a program:
   powershell.exe   with arguments:   -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\Sync-ProjectLibrary.ps1"

Other switches
 -DryRun  shows what would be uploaded, uploads nothing.
 -Reset   forgets the folder, the key and what was sent.
