#include <stdio.h>
#include <stdbool.h>
#include <stdbool.h>
int main(void){

bool achei = false;
for (int d = 2; d <= 6; d++) {
    if (7 % d == 0) {
        achei = true;
    }
}
printf("%d\n", achei);

return 0;}
