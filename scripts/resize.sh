
files=`find -iname '*.png' -o -iname '*.jpg' -o -iname '*.gif'`
for i in $files; do
    filename=${i%.*}
    convert $i -resize 200x tmp.png
    rm $i
    convert tmp.png -background none -gravity center -extent 200x100 ${filename}.png
    rm tmp.png
done
