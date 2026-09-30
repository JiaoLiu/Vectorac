import {CATEGORIES,PART_GROUPS} from '../.vuepress/components/dressup/parts.mjs'
// Exercise the actual group and category controls, not Vue internals.
export async function chooseCategory(page,name){
 const category=CATEGORIES.find(c=>c.name===name),group=PART_GROUPS.find(g=>g.categories.includes(category.id))
 await page.locator('.fw-part-groups').getByRole('button',{name:group.name,exact:true}).click()
 await page.locator('.fw-part-categories').getByRole('button',{name,exact:true}).click()
}
