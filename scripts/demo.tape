# Records docs/demo.gif. Run from the repo root after `npm run build`:
#   vhs scripts/demo.tape
Output docs/demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1240
Set Height 640
Set Padding 28
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type "export PS1='\[\e[38;5;114m\]❯\[\e[0m\] '" Enter
Type "clear" Enter
Show

Type `node scripts/demo.mjs "Myeongdong" "Seongsu"`
Sleep 400ms
Enter
Sleep 4s

Type `node scripts/demo.mjs "강남" "경복궁"`
Sleep 400ms
Enter
Sleep 5s
